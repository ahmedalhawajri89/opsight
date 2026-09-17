<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * Cancellations both ROSE and are now HIGH.
 *
 * Two conditions, deliberately. A rise from 1% to 7% is a six-point jump and
 * still a healthy cancellation rate; a flat 12% is unhealthy but is not news
 * this week. Requiring both catches the case a manager actually needs to hear
 * about — it got worse, and it is now bad — and keeps the other two off the
 * dashboard where they would erode trust in everything beside them.
 */
final class CancellationSpike extends Rule
{
    public function id(): string
    {
        return 'cancellation_spike';
    }

    public function severity(): string
    {
        return 'warning';
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $rate = $context->metric('cancellation_rate');

        if ($rate === null || $rate->value === null || $rate->changeAbsolute === null) {
            return null;
        }

        $rise = (float) $this->config('rise_points', 0.05);
        $floor = (float) $this->config('floor', 0.10);

        $current = (float) $rate->value;

        if ($rate->changeAbsolute < $rise || $current < $floor) {
            return null;
        }

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: __('insights.cancellation_spike.title'),
            message: __('insights.cancellation_spike.message', [
                'rate' => $this->pct($current),
                'points' => $this->points($rate->changeAbsolute),
                'basis' => $this->basis($context),
            ]),
            link: $context->link(['metric' => 'orders_count']),
            values: [
                'rate' => round($current, 4),
                'change_points' => round($rate->changeAbsolute, 4),
            ],
        );
    }
}
