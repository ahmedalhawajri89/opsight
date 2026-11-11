<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Export\CsvExport;
use App\Http\Controllers\Controller;
use App\Http\Resources\ActivityLogResource;
use App\Models\ActivityLog;
use App\Models\BusinessSetting;
use App\Support\QueryFilter;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The audit trail, read-only.
 *
 * There is no store, update or destroy method, and that is the API surface of
 * the integrity guarantee in SECURITY.md §10: the application cannot alter
 * this table because it has no code that does.
 *
 * CURSOR PAGINATION, not offset. This is the highest-growth table in the
 * system, and `OFFSET 40000` makes the database walk forty thousand rows to
 * throw them away — the deeper the page, the slower it gets, exactly as the
 * table fills up. A cursor seeks straight to the key. The trade is that page
 * numbers and a total count are unavailable, which an audit log does not need:
 * nobody navigates to page 400 of an event stream, they filter it.
 *
 * The second reason is correctness. Rows arrive constantly, so offset paging
 * shifts entries between pages while a reader is paging through — an audit
 * tool that can skip an entry is not an audit tool.
 */
class ActivityController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', ActivityLog::class);

        return ActivityLogResource::collection(
            $this->listing($request)
                ->cursorPaginate(QueryFilter::perPage($request))
                ->withQueryString(),
        );
    }

    /**
     * The filtered query behind both the screen and the export.
     *
     * @return Builder<ActivityLog>
     */
    private function listing(Request $request): Builder
    {
        $filter = new QueryFilter(
            filters: [
                'action' => QueryFilter::exact('action'),
                'category' => self::category(),
                'user_id' => QueryFilter::exact('user_id'),
                'subject_type' => QueryFilter::exact('subject_type'),
                'subject_id' => QueryFilter::exact('subject_id'),
                'from' => QueryFilter::dateFrom('created_at'),
                'to' => QueryFilter::dateTo('created_at'),
            ],
            // Newest first is the only ordering this screen has a use for, and
            // the cursor must seek on the key it orders by.
            sortable: [],
            defaultSort: '-created_at',
        );

        /** @var Builder<ActivityLog> $query */
        $query = $filter->apply(ActivityLog::query()->with('user'), $request);

        /*
         * The id tiebreaker is REQUIRED, not tidiness.
         *
         * A cursor is a "seek past this position" clause, so the ordering has
         * to be unique. `created_at` has one-second resolution and confirming
         * an order writes several rows inside one second; with ties on the
         * ordering column the seek can land mid-group and silently drop the
         * rest of it. An audit log that omits rows when paged is worse than a
         * slow one. The primary key makes the sequence total.
         */
        return $query->orderBy('id', 'desc');
    }

    /**
     * The log's areas, each a set of action prefixes. One place, so the
     * screen's chips and the export filter the same rows.
     */
    public const CATEGORIES = [
        'security' => ['auth.'],
        'sales' => ['order.', 'orderitem.', 'customer.'],
        'catalogue' => ['product.', 'category.', 'inventory.', 'import.'],
        'money' => ['expense.', 'expensecategory.', 'forecast.', 'report.'],
        'people' => ['user.'],
        'system' => ['settings.', 'business.', 'integration.', 'webhook.', 'export.', 'activity.'],
    ];

    /**
     * Narrows to one area of the business. An area this list does not know
     * returns nothing rather than everything: a filter that silently stops
     * filtering is how an audit reader misses a row.
     *
     * @return callable(Builder<covariant Model>, string): mixed
     */
    private static function category(): callable
    {
        return static function (Builder $query, string $value): Builder {
            $prefixes = self::CATEGORIES[$value] ?? null;

            if ($prefixes === null) {
                return $query->whereRaw('1 = 0');
            }

            return $query->where(static function (Builder $inner) use ($prefixes): void {
                foreach ($prefixes as $prefix) {
                    $inner->orWhere('action', 'like', $prefix.'%');
                }
            });
        };
    }

    public function export(Request $request, CsvExport $export): StreamedResponse
    {
        $this->authorize('export', ActivityLog::class);

        /*
         * Exporting the audit log is itself audited, by the same code path as
         * every other export — which means this request appends a row to the
         * very table it is reading. That is correct and not a curiosity: the
         * one export a person covering their tracks would most want is this
         * one, and it must leave a mark.
         */
        return $export->stream(
            query: $this->listing($request),
            resource: ActivityLogResource::class,
            columns: [
                'occurred_at' => __('labels.csv.occurred_at'),
                'action' => __('labels.csv.action'),
                'actor.name' => __('labels.csv.actor'),
                'actor.role_label' => __('labels.csv.role'),
                'subject_type' => __('labels.csv.subject'),
                'subject_id' => __('labels.csv.subject_id'),
                'ip_address' => __('labels.csv.ip_address'),
            ],
            request: $request,
            filename: 'activity-log',
        );
    }

    /** Sign-in attempts that did not get in, and the guards they tripped. */
    private const FAILED_SIGN_INS = ['auth.login_failed', 'auth.failed', 'auth.google_failed', 'auth.google_no_account', 'auth.lockout', 'auth.throttled'];

    /**
     * The log at a glance: how busy today was, who was at work, the last
     * fourteen days as a count per day, and the failed sign-ins of the week.
     *
     * Days are the BUSINESS's days, in its own timezone: "today" at two in
     * the morning in Riyadh is not yesterday in UTC.
     *
     * @return array{data: array<string, mixed>}
     */
    public function summary(Request $request): array
    {
        $this->authorize('viewAny', ActivityLog::class);

        $timezone = BusinessSetting::current()->timezone ?: 'UTC';
        $today = CarbonImmutable::now($timezone)->startOfDay();
        $from = $today->subDays(13);

        /*
         * Counted by the database, not by loading the rows: a busy business
         * writes thousands of entries a fortnight. Bucketed by UTC hour and
         * moved to the business's day here, which is exact for every
         * whole-hour timezone (all of the Gulf) and needs no timezone tables
         * in MySQL.
         */
        $hours = ActivityLog::query()
            ->toBase()
            ->where('created_at', '>=', $from->utc())
            ->selectRaw("DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS hour, COUNT(*) AS total")
            ->groupBy('hour')
            ->get();

        $daily = [];

        for ($d = 0; $d < 14; $d++) {
            $daily[$from->addDays($d)->toDateString()] = 0;
        }

        foreach ($hours as $row) {
            $day = CarbonImmutable::parse((string) $row->hour, 'UTC')->setTimezone($timezone)->toDateString();

            if (array_key_exists($day, $daily)) {
                $daily[$day] += (int) $row->total;
            }
        }

        $people = ActivityLog::query()
            ->where('created_at', '>=', $today->utc())
            ->whereNotNull('user_id')
            ->distinct()
            ->count('user_id');

        $failed = ActivityLog::query()
            ->where('created_at', '>=', $today->subDays(6)->utc())
            ->whereIn('action', self::FAILED_SIGN_INS)
            ->count();

        return ['data' => [
            'today' => $daily[$today->toDateString()],
            'week' => array_sum(array_slice($daily, 7)),
            'people_today' => $people,
            'failed_sign_ins_week' => $failed,
            'failed_sign_in_actions' => self::FAILED_SIGN_INS,
            'daily' => array_map(
                static fn (string $date, int $count): array => ['date' => $date, 'count' => $count],
                array_keys($daily),
                array_values($daily),
            ),
        ]];
    }

    /**
     * The distinct actions present in the log, for the filter control.
     *
     * Derived from the data rather than from a hardcoded list, so an action
     * added by a later feature appears in the filter without anyone editing a
     * second place — and an action that has never actually occurred does not
     * clutter the control with a value that returns nothing.
     *
     * @return array{data: array<int, string>}
     */
    public function actions(Request $request): array
    {
        $this->authorize('viewAny', ActivityLog::class);

        /** @var array<int, string> $actions */
        $actions = ActivityLog::query()
            ->distinct()
            ->orderBy('action')
            ->pluck('action')
            ->all();

        return ['data' => $actions];
    }
}
