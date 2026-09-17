<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

use App\Authorization\Ability;
use App\Domain\Orders\OrderStatus;
use App\Models\BusinessSetting;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * A metric over time.
 *
 * TWO RULES, both because a chart that omits something lies about slope:
 *
 * 1. **Buckets with no data are emitted as zeros, not omitted.** A gap in a
 *    date series makes a line chart draw a straight run between two distant
 *    points, which reads as steady trade through a week when nothing sold.
 *
 * 2. **The final bucket is flagged when it contains today.** A month two days
 *    in is not a low month; it is an unfinished one, and the UI renders it
 *    dashed rather than as a cliff (METRICS.md §3).
 *
 * Bucket boundaries are computed in the BUSINESS timezone, like every other
 * period boundary, then converted for the query.
 *
 * A NOTE ON THE LAYER RULE. L2 is supposed to compose from L1 rather than
 * query L0 itself, and this class does not: a per-bucket aggregation cannot be
 * expressed as N calls to a period-scoped metric without issuing N queries —
 * 31 for a month, 36 for three years. So it writes its own SQL.
 *
 * That deviation is only safe because of a guard: a test asserts that the
 * buckets SUM to the figure MetricCalculator reports for the whole period. If
 * the two definitions ever drift, the sum stops matching and the test fails.
 * Without that test this would be a second definition of revenue, which is the
 * exact failure METRICS.md exists to prevent.
 */
final class TimeSeries
{
    /**
     * Grain defaults by span: daily up to 31 days, weekly to 180, monthly after.
     *
     * A three-year daily chart is 1,095 points nobody can read, and a
     * seven-day monthly chart is one point.
     */
    public static function grainFor(Period $period, ?string $requested = null): string
    {
        if (in_array($requested, ['day', 'week', 'month'], strict: true)) {
            return $requested;
        }

        $days = $period->lengthInDays();

        return match (true) {
            $days <= 31 => 'day',
            $days <= 180 => 'week',
            default => 'month',
        };
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function build(Period $period, string $metric, string $grain, ?User $user): array
    {
        $this->assertMetricIsPermitted($metric, $user);

        $rows = $this->query($period, $metric, $grain);
        $buckets = $this->emptyBuckets($period, $grain);
        $today = Carbon::now($period->timezone)->toDateString();

        foreach ($buckets as $key => $bucket) {
            $buckets[$key]['value'] = $rows[$bucket['bucket']] ?? $this->zeroFor($metric);
        }

        // Flag the bucket that contains today, if any.
        foreach ($buckets as $key => $bucket) {
            $buckets[$key]['is_partial'] =
                $bucket['bucket'] <= $today && $bucket['bucket_end'] >= $today;
        }

        return array_values($buckets);
    }

    /**
     * Every bucket in the period, pre-filled.
     *
     * Built from the calendar rather than from the rows, which is what
     * guarantees an empty week still appears.
     *
     * @return array<string, array<string, mixed>>
     */
    private function emptyBuckets(Period $period, string $grain): array
    {
        $timezone = $period->timezone;
        $cursor = Carbon::parse($period->from, $timezone)->startOfDay();
        $end = Carbon::parse($period->to, $timezone)->startOfDay();

        /*
         * The week boundaries are named, never left to the default.
         *
         * Carbon's default first day of the week follows the application
         * locale, and Arabic starts the week on Saturday. The SQL grouping
         * below uses WEEKDAY(), which is always Monday-based, so under an
         * Arabic request the bucket keys stopped matching the grouped rows and
         * every weekly value came back as zero. A metric must not change with
         * the reader's language.
         */
        $cursor = match ($grain) {
            'week' => $cursor->startOfWeek(Carbon::MONDAY),
            'month' => $cursor->startOfMonth(),
            default => $cursor,
        };

        $buckets = [];

        while ($cursor <= $end) {
            $bucketEnd = match ($grain) {
                'week' => $cursor->clone()->endOfWeek(Carbon::SUNDAY),
                'month' => $cursor->clone()->endOfMonth(),
                default => $cursor->clone(),
            };

            $buckets[$cursor->toDateString()] = [
                'bucket' => $cursor->toDateString(),
                'bucket_end' => $bucketEnd->toDateString(),
                'label' => $this->label($cursor, $grain),
                'value' => null,
                'is_partial' => false,
            ];

            $cursor = match ($grain) {
                'week' => $cursor->addWeek(),
                'month' => $cursor->addMonth(),
                default => $cursor->addDay(),
            };
        }

        return $buckets;
    }

    /**
     * @return array<string, int|string>
     */
    private function query(Period $period, string $metric, string $grain): array
    {
        [$from, $to] = $period->utcBounds();
        $timezone = BusinessSetting::current()->timezone;

        /*
         * placed_at is stored in UTC, so it is converted to the business
         * timezone BEFORE being truncated to a bucket. Grouping on the raw UTC
         * value would put a late-evening order into the wrong day for any
         * business east of Greenwich — which is most of them.
         */
        $local = "CONVERT_TZ(placed_at, '+00:00', ?)";
        $offset = $this->utcOffset($timezone);

        $bucketExpression = match ($grain) {
            'week' => "DATE(DATE_SUB({$local}, INTERVAL WEEKDAY({$local}) DAY))",
            'month' => "DATE_FORMAT({$local}, '%Y-%m-01')",
            default => "DATE({$local})",
        };

        $valueExpression = match ($metric) {
            'net_revenue' => 'COALESCE(SUM(subtotal_amount - discount_amount - refunded_amount), 0)',
            'gross_revenue' => 'COALESCE(SUM(subtotal_amount), 0)',
            'orders_count' => 'COUNT(*)',
            'cogs' => 'COALESCE(SUM(cogs_amount), 0)',
            'gross_profit' => 'COALESCE(SUM(subtotal_amount - discount_amount - refunded_amount - cogs_amount), 0)',
            default => throw new InvalidArgumentException("Unknown time series metric: {$metric}."),
        };

        // The bucket expression repeats the offset binding once per use.
        $bindings = array_fill(0, substr_count($bucketExpression, '?'), $offset);

        $rows = DB::table('orders')
            ->whereIn('status', OrderStatus::qualifying())
            ->where('placed_at', '>=', $from)
            ->where('placed_at', '<', $to)
            ->selectRaw("{$bucketExpression} AS bucket, {$valueExpression} AS value", $bindings)
            ->groupBy('bucket')
            ->get();

        return $rows->mapWithKeys(fn ($row): array => [
            (string) $row->bucket => $this->castValue($row->value, $metric),
        ])->all();
    }

    private function castValue(mixed $value, string $metric): int|string
    {
        // Counts are integers; money stays a string and never becomes a float.
        return $metric === 'orders_count' ? (int) $value : (string) $value;
    }

    private function zeroFor(string $metric): int|string
    {
        return $metric === 'orders_count' ? 0 : '0.00';
    }

    private function label(Carbon $date, string $grain): string
    {
        return match ($grain) {
            'week' => $date->format('d M'),
            'month' => $date->format('M Y'),
            default => $date->format('d M'),
        };
    }

    /** MySQL CONVERT_TZ needs a named zone loaded or an offset; the offset always works. */
    private function utcOffset(string $timezone): string
    {
        return Carbon::now($timezone)->format('P');
    }

    /**
     * A cost-bearing series is refused outright rather than returned empty.
     *
     * Returning zeros would tell a cost-blind caller that profit was nil, which
     * is a different and false claim.
     */
    private function assertMetricIsPermitted(string $metric, ?User $user): void
    {
        if (! in_array($metric, ['cogs', 'gross_profit'], strict: true)) {
            return;
        }

        if (! ($user?->can(Ability::MetricsViewCost->value) ?? false)) {
            abort(403, __('errors.http.metric_not_permitted'));
        }
    }
}
