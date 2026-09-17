<?php

declare(strict_types=1);

namespace App\Domain\Insights;

/**
 * One deterministic rule over the analytics layer.
 *
 * DETERMINISTIC IS THE WHOLE DESIGN. There is no model here, no scoring, no
 * anomaly detection. A rule is a threshold comparison whose behaviour can be
 * stated in a sentence and asserted in a test, and whose output a manager can
 * check by hand against the analytics screen.
 *
 * That is a deliberate rejection of the alternative. A statistical detector
 * would find more, and when it produced a finding nobody could explain — or,
 * worse, silently stopped producing one — there would be no way to tell
 * whether the business had changed or the model had. An operations tool has to
 * be auditable before it is clever.
 */
interface InsightRule
{
    /** Stable identifier, e.g. `margin_decline`. Also the config key. */
    public function id(): string;

    /** One of Insight::SEVERITIES. */
    public function severity(): string;

    /**
     * Whether this rule reads cost, margin or profit.
     *
     * A rule that returns true is NOT EVALUATED for a role without
     * `metrics.view_cost` — not evaluated and then filtered, not computed and
     * then hidden. Absence of computation is the security boundary, so the
     * figure never exists in the process serving that request
     * (METRICS.md §4, SECURITY.md §4).
     */
    public function requiresCost(): bool;

    /**
     * Whether the rule describes NOW rather than the selected period.
     *
     * Point-in-time rules survive both suppression guards. "Nine products are
     * below their reorder point" is true at 9am on the first of the month in a
     * way that "revenue is down 94%" is not, and it is equally true in a month
     * with four orders as in one with four hundred.
     */
    public function isPointInTime(): bool;

    /**
     * Returns the finding, or null when the rule does not fire.
     *
     * A rule may also return null because the data it needs is missing — no
     * comparison period, an undefined ratio. That is not an error and must not
     * be turned into one: an insight that cannot be computed is simply absent,
     * exactly as a metric that cannot be computed is an em dash rather than a
     * zero (METRICS.md §1.6).
     */
    public function evaluate(InsightContext $context): ?Insight;
}
