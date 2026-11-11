<?php

declare(strict_types=1);

namespace App\Domain\Brief;

use App\Authorization\Ability;
use App\Domain\Insights\InsightEngine;
use App\Domain\Metrics\Comparison;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\Period;
use App\Models\BusinessSetting;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * What one person should know at eight in the morning (product track,
 * phase C).
 *
 * EVERY FIGURE IS COMPUTED, NONE IS WORDED BY A MODEL. Yesterday's sales
 * against the same weekday last week, the month so far, what is owed, what is
 * about to run out, and the first three findings of the insight rules —
 * each through the function the dashboard already uses. A brief costs
 * nothing to send and cannot misstate a number (ADR-038's rule, kept without
 * the model).
 *
 * THE SAME WEEKDAY LAST WEEK, not the day before. Monday against Sunday
 * compares a working day with a weekend in most of the Gulf; Monday against
 * last Monday compares like with like.
 *
 * THE ROLE DECIDES WHAT IS IN IT, exactly as on the dashboard: gross profit
 * only for someone who may see cost, receivables only for someone who may
 * read the analytics, stock only for someone who may see the inventory.
 */
final class MorningBrief
{
    public function __construct(
        private readonly MetricCalculator $metrics,
        private readonly InsightEngine $insights,
    ) {}

    /**
     * Runs inside the user's business. Raw values — formatting is the
     * channel's job, in the reader's own language and digits.
     *
     * @return array{
     *     business: string, currency: string, decimals: int, date: string,
     *     revenue: string, revenue_last_week: string, change: float|null,
     *     orders: int, gross_profit: string|null, month_to_date: string,
     *     receivables: string|null, stock: list<string>,
     *     actions: list<array{title: string, message: string}>, quiet: bool
     * }
     */
    public function for(User $user, ?CarbonImmutable $now = null): array
    {
        $settings = BusinessSetting::current();
        $timezone = $settings->timezone ?: 'UTC';
        $today = ($now ?? CarbonImmutable::now())->setTimezone($timezone)->startOfDay();
        $yesterday = $today->subDay();

        $day = Period::between($yesterday->toDateString(), $yesterday->toDateString(), $timezone);
        $lastWeek = Period::between($yesterday->subWeek()->toDateString(), $yesterday->subWeek()->toDateString(), $timezone);
        $month = Period::between($yesterday->startOfMonth()->toDateString(), $yesterday->toDateString(), $timezone);

        $revenue = $this->metrics->netRevenue($day);
        $before = $this->metrics->netRevenue($lastWeek);
        $orders = $this->metrics->ordersCount($day);

        $stock = [];

        if ($user->can(Ability::InventoryView->value)) {
            $atRisk = array_map(static fn (array $row): string => $row['name'], $this->metrics->stockoutRisks(7, 30, 5));
            $low = array_map(static fn (array $row): string => $row['name'], $this->metrics->lowStockProducts(5));
            $stock = array_slice(array_values(array_unique([...$atRisk, ...$low])), 0, 5);
        }

        $week = Period::between($yesterday->subDays(6)->toDateString(), $yesterday->toDateString(), $timezone);
        $actions = array_map(
            static fn ($insight): array => ['title' => $insight->title, 'message' => $insight->message],
            array_slice($this->insights->for($week, Comparison::PreviousPeriod, $user), 0, 3),
        );

        return [
            'business' => $settings->company_name,
            'currency' => $settings->currency,
            'decimals' => (int) $settings->currency_decimals,
            'date' => $yesterday->toDateString(),
            'revenue' => $revenue,
            'revenue_last_week' => $before,
            'change' => bccomp($before, '0', 4) > 0
                ? round((float) bcdiv(bcsub($revenue, $before, 4), $before, 6), 4)
                : null,
            'orders' => $orders,
            'gross_profit' => $user->can(Ability::MetricsViewCost->value) ? $this->metrics->grossProfit($day) : null,
            'month_to_date' => $this->metrics->netRevenue($month),
            'receivables' => $user->can(Ability::AnalyticsView->value) ? $this->metrics->receivables() : null,
            'stock' => $stock,
            'actions' => $actions,
            // Nothing sold and nothing to say: the channel sends a short line
            // rather than a page of zeros.
            'quiet' => $orders === 0 && $actions === [] && $stock === [],
        ];
    }
}
