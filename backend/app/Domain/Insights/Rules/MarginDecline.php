<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightContext;

/**
 * Gross margin fell materially against the comparison period.
 *
 * The message names the CAUSE rather than only the symptom, because "margin
 * fell 4 points" leaves a manager with a question and no way to answer it,
 * while "COGS rose 22% while revenue rose 9%" tells them which of the two
 * levers moved. The arithmetic is not hidden: both figures come straight from
 * the summary the analytics screen shows.
 */
final class MarginDecline extends Rule
{
    public function id(): string
    {
        return 'margin_decline';
    }

    public function severity(): string
    {
        return 'warning';
    }

    public function requiresCost(): bool
    {
        return true;
    }

    public function evaluate(InsightContext $context): ?Insight
    {
        $margin = $context->metric('gross_margin');

        // Null when the margin is undefined in either period — no revenue to
        // divide by. Undefined is not "fell to zero".
        if ($margin?->changeAbsolute === null) {
            return null;
        }

        $drop = (float) $this->config('drop_points', 0.03);

        if ($margin->changeAbsolute > -$drop) {
            return null;
        }

        $cogs = $context->metric('cogs');
        $revenue = $context->metric('net_revenue');

        $cause = $cogs?->changePercent !== null && $revenue?->changePercent !== null
            ? sprintf(
                ' Cost of goods %s %s%% while net revenue %s %s%%.',
                $cogs->changePercent >= 0 ? 'rose' : 'fell',
                $this->pct($cogs->changePercent),
                $revenue->changePercent >= 0 ? 'rose' : 'fell',
                $this->pct($revenue->changePercent),
            )
            : '';

        return new Insight(
            id: $this->id(),
            severity: $this->severity(),
            title: 'Gross margin is down',
            message: sprintf(
                'Gross margin fell %s percentage points against the %s.%s',
                $this->points($margin->changeAbsolute),
                $context->comparison->label(),
                $cause,
            ),
            link: $context->link(['metric' => 'gross_profit']),
            values: [
                'margin_change_points' => round($margin->changeAbsolute, 4),
                'cogs_change_pct' => $cogs?->changePercent,
                'revenue_change_pct' => $revenue?->changePercent,
            ],
        );
    }
}
