<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightEngine;
use App\Domain\Metrics\Comparison;
use App\Domain\Metrics\Period;
use App\Models\Product;
use App\Models\User;
use Tests\Support\InsightFixture;

/*
|--------------------------------------------------------------------------
| Insights (L3)
|--------------------------------------------------------------------------
|
| METRICS.md §4. Two kinds of assertion live here and they are not the same:
|
|   - that a rule FIRES on the shape it describes, and
|   - that it STAYS SILENT everywhere else.
|
| The second is the one that matters more. A rule that fires too readily does
| not merely add noise: it teaches the reader that the feed is noise, and then
| the one alert that mattered is skipped with the rest.
|
*/

function run(?User $user = null, ?Period $period = null): array
{
    return app(InsightEngine::class)->for(
        $period ?? InsightFixture::period(),
        Comparison::PreviousPeriod,
        $user ?? User::factory()->role(Role::Owner)->create(),
    );
}

function ids(array $insights): array
{
    return array_map(static fn (Insight $i): string => $i->id, $insights);
}

/* -------------------------------------------------------------------------- */
/* Rules fire on the shape they describe */
/* -------------------------------------------------------------------------- */

it('reports a revenue drop past the threshold', function (): void {
    // 100 → 70 per order across the same order count: a 30% fall.
    InsightFixture::build(currentUnitPrice: 70.0, previousUnitPrice: 100.0);

    expect(ids(run()))->toContain('revenue_drop');
});

it('stays silent on a fall that has not reached the threshold', function (): void {
    // 100 → 95 is a 5% fall, well inside the 15% threshold.
    InsightFixture::build(currentUnitPrice: 95.0, previousUnitPrice: 100.0);

    expect(ids(run()))->not->toContain('revenue_drop');
});

it('reports a revenue surge past the threshold', function (): void {
    InsightFixture::build(currentUnitPrice: 140.0, previousUnitPrice: 100.0);

    expect(ids(run()))->toContain('revenue_surge');
});

it('reports a margin decline and names what moved', function (): void {
    /*
     * Revenue held at 100, cost raised 40 → 62. Margin 60% → 38%, a 22-point
     * fall, with COGS up 55% while revenue is flat — which is precisely the
     * sentence the rule should produce.
     */
    InsightFixture::build(
        currentUnitPrice: 100.0,
        currentUnitCost: 62.0,
        previousUnitPrice: 100.0,
        previousUnitCost: 40.0,
    );

    $insights = run();
    $margin = collect($insights)->firstWhere('id', 'margin_decline');

    expect($margin)->not->toBeNull()
        ->and($margin->severity)->toBe('warning')
        ->and($margin->message)->toContain('percentage points')
        ->and($margin->message)->toContain('Cost of goods rose');
});

it('reports spending that both rose sharply and is material', function (): void {
    InsightFixture::build();

    InsightFixture::expense('Marketing', '2026-06-10', 100.00);
    // 100 → 400 is a 300% rise, and 400 against 1,200 revenue is 33%.
    InsightFixture::expense('Marketing', '2026-07-10', 400.00);

    expect(ids(run()))->toContain('expense_spike');
});

it('ignores a sharp rise in a category too small to matter', function (): void {
    /*
     * A stationery budget doubling from 4 to 12 is a 200% rise and is not
     * news. Without the share-of-revenue condition, this is the kind of line
     * that fills the feed and drives the reader away from it.
     */
    InsightFixture::build();

    InsightFixture::expense('Software', '2026-06-10', 4.00);
    InsightFixture::expense('Software', '2026-07-10', 12.00);

    expect(ids(run()))->not->toContain('expense_spike');
});

it('reports a sold item carrying no recorded cost', function (): void {
    InsightFixture::build(currentUnitCost: 0.0, previousUnitCost: 40.0);

    $insights = run();
    $quality = collect($insights)->firstWhere('id', 'zero_cost_products');

    expect($quality)->not->toBeNull()
        ->and($quality->severity)->toBe('data_quality')
        // The direction of the error is the point: nobody investigates a
        // margin that looks better than expected.
        ->and($quality->message)->toContain('higher than the truth');
});

it('reports low stock as a point-in-time finding', function (): void {
    InsightFixture::build();

    Product::factory()->withStock(0)->create();

    $insights = run();
    $low = collect($insights)->firstWhere('id', 'low_stock');

    expect($low)->not->toBeNull()
        ->and($low->severity)->toBe('action')
        ->and($low->message)->toContain('as of now');
});

/* -------------------------------------------------------------------------- */
/* The three suppression guards */
/* -------------------------------------------------------------------------- */

it('holds back every period rule while the period is still in progress', function (): void {
    /*
     * The guard that matters most in practice. The dashboard's default window
     * is a rolling thirty days, which always includes today — so without this,
     * "revenue is down 94%" would greet every reader at 09:00 on the first of
     * the month, be arithmetically correct, and be worthless.
     */
    InsightFixture::build(currentUnitPrice: 40.0, previousUnitPrice: 100.0);

    $partial = Period::preset('30d');

    expect($partial->isPartial())->toBeTrue()
        ->and(ids(run(period: $partial)))->not->toContain('revenue_drop');
});

it('still reports stock while the period is in progress', function (): void {
    // Point-in-time rules survive the guard: a shelf is empty at 09:00 on the
    // first in a way that "revenue is down" is not.
    Product::factory()->withStock(0)->create();

    expect(ids(run(period: Period::preset('30d'))))->toContain('low_stock');
});

it('holds back percentage rules on a period with too few orders', function (): void {
    config()->set('insights.minimum_orders', 10);

    /*
     * A 60% fall — comfortably past the 15% threshold — on three orders
     * against three. The rule WOULD fire on this shape at volume, which is the
     * point: the guard is what stops it, not an absence of data.
     */
    InsightFixture::build(
        currentUnitPrice: 40.0,
        previousUnitPrice: 100.0,
        currentOrders: 3,
        previousOrders: 3,
    );

    expect(ids(run()))->not->toContain('revenue_drop');

    // The same data with the guard lowered: the rule fires, so the assertion
    // above is about the guard and not about the fixture being empty.
    config()->set('insights.minimum_orders', 2);

    expect(ids(run()))->toContain('revenue_drop');
});

it('holds back a rule when only the COMPARISON period is thin', function (): void {
    /*
     * Twenty orders this month against three last month. The CURRENT period
     * clears the guard comfortably, so a check that looked only at it would
     * let the rule through — and every month following a quiet one would fill
     * the feed with swings measured against almost nothing.
     */
    config()->set('insights.minimum_orders', 10);

    InsightFixture::build(
        currentUnitPrice: 40.0,
        previousUnitPrice: 100.0,
        currentOrders: 20,
        previousOrders: 3,
    );

    expect(ids(run()))->not->toContain('revenue_drop');
});

/* -------------------------------------------------------------------------- */
/* Cost-bearing rules are not evaluated for a cost-blind role */
/* -------------------------------------------------------------------------- */

it('does not evaluate a cost-bearing rule for a role without metrics.view_cost', function (): void {
    /*
     * METRICS.md §5.14 and §4. NOT EVALUATED, not evaluated-and-filtered. The
     * distinction is the security boundary: the figure never exists in the
     * process serving this request, so there is nothing to leak through a log
     * line, an error message or a later refactor that forgets the filter.
     */
    InsightFixture::build(
        currentUnitPrice: 100.0,
        currentUnitCost: 62.0,
        previousUnitPrice: 100.0,
        previousUnitCost: 40.0,
    );

    $staff = User::factory()->role(Role::Staff)->create();
    $owner = User::factory()->role(Role::Owner)->create();

    expect(ids(run($staff)))->not->toContain('margin_decline')
        ->and(ids(run($staff)))->not->toContain('zero_cost_products')
        ->and(ids(run($staff)))->not->toContain('expense_spike')
        // The same data, for a role that may see cost.
        ->and(ids(run($owner)))->toContain('margin_decline');
});

it('still gives a cost-blind role the insights it is entitled to', function (): void {
    InsightFixture::build(currentUnitPrice: 70.0, previousUnitPrice: 100.0);

    $staff = User::factory()->role(Role::Staff)->create();

    // Revenue is not a cost figure. Hiding it too would be over-correction.
    expect(ids(run($staff)))->toContain('revenue_drop');
});

/* -------------------------------------------------------------------------- */
/* Shape of the finding */
/* -------------------------------------------------------------------------- */

it('carries a link back to the evidence behind every period insight', function (): void {
    InsightFixture::build(currentUnitPrice: 70.0, previousUnitPrice: 100.0);

    $drop = collect(run())->firstWhere('id', 'revenue_drop');

    /*
     * A claim a reader cannot check is one they have to take on trust, and the
     * first time it turns out to be an artefact they stop reading the feed.
     * The link carries the period the insight was computed for, so the screen
     * shows the same figures the sentence quoted rather than today's.
     */
    expect($drop->link)->toMatchArray([
        'preset' => 'custom',
        'from' => InsightFixture::CURRENT_FROM,
        'to' => InsightFixture::CURRENT_TO,
    ]);
});

it('uses only declared severities', function (): void {
    InsightFixture::build(currentUnitPrice: 70.0, previousUnitPrice: 100.0);
    Product::factory()->withStock(0)->create();

    foreach (run() as $insight) {
        expect(Insight::SEVERITIES)->toContain($insight->severity);
    }
});

/* -------------------------------------------------------------------------- */
/* The endpoint */
/* -------------------------------------------------------------------------- */

it('explains an empty feed rather than returning a bare empty list', function (): void {
    /*
     * "Nothing is wrong" and "the rules were not allowed to run" are
     * completely different statements, and a UI that renders both as blank
     * space is lying by omission in one of the two cases.
     */
    $owner = User::factory()->role(Role::Owner)->create();

    $response = $this->actingAs($owner)
        ->getJson('/api/v1/insights?preset=30d')
        ->assertOk();

    expect($response->json('meta.suppressed.reason'))->toBe('partial_period')
        ->and($response->json('meta.suppressed.message'))->toContain('still in progress');
});

it('reports no suppression on a complete period with enough volume', function (): void {
    InsightFixture::build(currentUnitPrice: 70.0, previousUnitPrice: 100.0);

    $owner = User::factory()->role(Role::Owner)->create();

    $response = $this->actingAs($owner)->getJson(sprintf(
        '/api/v1/insights?preset=custom&from=%s&to=%s',
        InsightFixture::CURRENT_FROM,
        InsightFixture::CURRENT_TO,
    ))->assertOk();

    expect($response->json('meta.suppressed.reason'))->toBeNull()
        ->and($response->json('data'))->not->toBeEmpty();
});
