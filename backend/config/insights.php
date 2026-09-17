<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Insight rules (L3)
|--------------------------------------------------------------------------
|
| Thresholds live here rather than as literals inside the rule bodies, for
| three reasons (METRICS.md §4):
|
|   1. They are business judgements, not code. "A 3-point margin drop is worth
|      mentioning" is a claim about this business, and the person qualified to
|      revise it should not have to read PHP to find it.
|   2. A test can set a threshold and assert the rule fires at it, instead of
|      constructing data that happens to exceed a number buried in a class.
|   3. Every threshold is visible in one place, which is the only way to notice
|      that two of them contradict each other.
|
| Ratios are expressed as decimals: 0.03 is three percentage points, 0.15 is
| fifteen percent. The unit each one is measured in is stated per entry,
| because "margin fell 3" is ambiguous in exactly the way that produces a
| wrong alert.
|
*/

return [

    /*
     * No percentage-based rule fires on a period this thin.
     *
     * Two orders becoming one is a 50% collapse in revenue and means nothing.
     * Surfacing it does not merely waste a line on the dashboard — it teaches
     * the reader that the feed is noise, and a feed nobody trusts is worse
     * than no feed, because it also buries the alert that mattered.
     *
     * Point-in-time rules are exempt: "eleven products are below their reorder
     * point" is a fact about the warehouse right now, not a swing measured on
     * a small sample, and the rationale above simply does not apply to it.
     */
    'minimum_orders' => 10,

    'rules' => [

        'margin_decline' => [
            // Percentage POINTS. Gross margin from 38% to 34% is 4 pp.
            'drop_points' => 0.03,
        ],

        'revenue_drop' => [
            // Percent, relative to the comparison period.
            'drop_pct' => 0.15,
        ],

        'revenue_surge' => [
            'rise_pct' => 0.20,
        ],

        'cancellation_spike' => [
            // BOTH must hold. A rise from 1% to 7% is a six-point jump but
            // still a healthy cancellation rate; a steady 12% is bad but not
            // news. The pair catches "got worse AND is now bad".
            'rise_points' => 0.05,
            'floor' => 0.10,
        ],

        'stockout_risk' => [
            'days_of_cover' => 7,
            // Only products that actually sold recently. A product with no
            // demand has no stockout risk, however little of it is on a shelf.
            'trailing_days' => 30,
            'max_products' => 5,
        ],

        'customer_concentration' => [
            // Share of net revenue held by the single largest customer.
            'share' => 0.25,
        ],

        'expense_spike' => [
            'rise_pct' => 0.40,
            // AND material relative to revenue, so a stationery bill doubling
            // from 40 to 80 does not reach the dashboard.
            'min_share_of_revenue' => 0.05,
        ],

        'dormant_customers' => [
            'days' => 90,
            // Below this the finding is an anecdote, not a pattern worth a
            // line on a dashboard.
            'minimum' => 3,
        ],
    ],
];
