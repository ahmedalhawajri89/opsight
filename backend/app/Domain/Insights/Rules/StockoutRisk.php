<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;
use App\Support\Localization\Localizer;

/**
 * Products that will run out within days at the current sales rate.
 *
 * Stronger than low stock, and different in kind: a product can sit above its
 * reorder point and still be four days from empty if it is selling fast, while
 * a slow-moving product below its reorder point may have a year of cover. This
 * rule reads the RATE; low stock reads the LEVEL.
 *
 * POINT-IN-TIME, for the same reason as low stock.
 */
final class StockoutRisk extends Rule
{
    public function id(): string
    {
        return 'stockout_risk';
    }

    public function severity(): string
    {
        return 'action';
    }

    public function isPointInTime(): bool
    {
        return true;
    }

    /**
     * @param  array{name: string, days: float}  $first
     */
    private function sentence(array $first, int $rest): string
    {
        $message = __('insights.stockout_risk.message', [
            'product' => $first['name'],
            'days' => app(Localizer::class)->number($first['days'], 1),
        ]);

        if ($rest === 0) {
            return $message;
        }

        return trans_choice('insights.stockout_risk.others', $rest, [
            'message' => rtrim($message, '.'),
            'count' => $this->count($rest),
        ]).'.';
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $risks = $context->calculator()->stockoutRisks(
            days: (int) $this->config('days_of_cover', 7),
            trailingDays: (int) $this->config('trailing_days', 30),
            limit: (int) $this->config('max_products', 5),
        );

        if ($risks === []) {
            return null;
        }

        $first = $risks[0];

        $rest = count($risks) - 1;

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: __('insights.stockout_risk.title'),
            message: $this->sentence($first, $rest),
            link: ['href' => '/inventory'],
            values: ['products' => $risks],
        );
    }
}
