<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\FulfilOrder;
use App\Domain\Orders\OrderReference;
use App\Domain\Orders\OrderStatus;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Routing\Route as RouteDefinition;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Tests\Support\MetricFixture;

/*
|--------------------------------------------------------------------------
| Isolation between businesses, from every door (ADR-023)
|--------------------------------------------------------------------------
|
| Business A is the test's own business. Business B is fully populated — and
| every name it holds carries a marker — and A's owner then tries every way in:
| every route that names a record, every list, every export, every analytics
| figure, every validation rule that accepts an id.
|
| The route-driven tests read the application's own route table, so a new
| endpoint is covered the day it is added, and a new kind of route parameter
| fails here until someone says which record it names.
|
*/

const LEAK_MARKER = 'LEAKMARKER';

/**
 * A second, fully populated business, with a marker in every name it holds.
 *
 * @return array{business: Business, owner: User, staff: User, customer: Customer, product: Product, expense: Expense, category: ExpenseCategory, draft: Order, fulfilled: Order}
 */
function otherBusiness(): array
{
    $business = Business::factory()->create(['name' => LEAK_MARKER.' Trading']);

    return CurrentBusiness::get()->run($business->id, function () use ($business): array {
        BusinessSetting::ensureExists(['company_name' => LEAK_MARKER.' Trading', 'currency' => 'KWD']);

        $owner = User::factory()->role(Role::Owner)->create(['name' => LEAK_MARKER.' Owner']);
        $staff = User::factory()->role(Role::Staff)->create(['name' => LEAK_MARKER.' Staff']);
        $customer = Customer::factory()->create(['name' => LEAK_MARKER.' Customer', 'email' => 'leak@other.test']);
        $product = Product::factory()->withStock(50)->create(['name' => LEAK_MARKER.' Product', 'sku' => 'LEAK-1']);
        $category = ExpenseCategory::factory()->create(['name' => LEAK_MARKER.' Rent']);
        $expense = Expense::factory()->create(['expense_category_id' => $category->id, 'description' => LEAK_MARKER.' expense']);

        $draft = Order::factory()->forCustomer($customer)->create(['notes' => LEAK_MARKER]);
        $draft->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'unit_price' => $product->price,
            'unit_cost' => $product->cost,
            'quantity' => 1,
            'line_discount' => 0,
            'line_total' => 0,
        ]);

        $fulfilled = Order::factory()->forCustomer($customer)->create();
        $fulfilled->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'unit_price' => $product->price,
            'unit_cost' => $product->cost,
            'quantity' => 2,
            'line_discount' => 0,
            'line_total' => 0,
        ]);
        $fulfilled = app(FulfilOrder::class)(app(ConfirmOrder::class)($fulfilled));

        // Inside the analytics period, so a leak in any aggregate shows a name.
        DB::table('orders')->where('id', $fulfilled->id)->update(['placed_at' => '2026-08-20 10:00:00']);

        return compact('business', 'owner', 'staff', 'customer', 'product', 'expense', 'category', 'draft', 'fulfilled');
    });
}

/** The body of a response, streamed or not. */
function bodyOf($response): string
{
    return $response->baseResponse instanceof StreamedResponse
        ? $response->streamedContent()
        : (string) $response->getContent();
}

/** @return list<RouteDefinition> */
function apiRoutes(): array
{
    return array_values(array_filter(
        Route::getRoutes()->getRoutes(),
        static fn (RouteDefinition $route): bool => str_starts_with($route->uri(), 'api/v1/'),
    ));
}

beforeEach(function (): void {
    $this->ownerA = User::factory()->role(Role::Owner)->create();
});

/*
|--------------------------------------------------------------------------
| Every route that names a record
|--------------------------------------------------------------------------
*/

it('answers 404 to every route that names another business\'s record, and changes nothing', function (): void {
    $b = otherBusiness();

    // Which of B's records each route parameter names. A new parameter name
    // fails the test below until it is added here.
    $records = [
        'customer' => $b['customer']->id,
        'expense' => $b['expense']->id,
        'product' => $b['product']->id,
        'order' => $b['draft']->id,
        'item' => $b['draft']->items()->withoutGlobalScopes()->value('id'),
        'user' => $b['staff']->id,
    ];

    $this->actingAs($this->ownerA);
    $tried = 0;

    foreach (apiRoutes() as $route) {
        $parameters = $route->parameterNames();

        if ($parameters === []) {
            continue;
        }

        $unknown = array_diff($parameters, array_keys($records));
        expect($unknown)->toBe([], "Route {$route->uri()} has a parameter this test cannot fill: ".implode(', ', $unknown));

        $uri = '/'.preg_replace_callback('/\{(\w+)\??\}/', static fn (array $m): string => (string) $records[$m[1]], $route->uri());

        foreach (array_diff($route->methods(), ['HEAD']) as $method) {
            $status = $this->json($method, $uri, ['role' => 'manager', 'amount' => '1', 'reason' => 'probe', 'quantity' => 1])->status();

            expect($status)->toBe(404, "{$method} {$uri} answered {$status} for another business's record");
            $tried++;
        }
    }

    expect($tried)->toBeGreaterThanOrEqual(29);

    // Nothing reached B: every record is exactly as it was left.
    CurrentBusiness::get()->run($b['business']->id, function () use ($b): void {
        expect($b['draft']->fresh()->status)->toBe(OrderStatus::Draft)
            ->and($b['draft']->items()->count())->toBe(1)
            ->and($b['fulfilled']->fresh()->status)->toBe(OrderStatus::Fulfilled)
            ->and($b['product']->fresh()->is_active)->toBeTrue()
            ->and($b['product']->fresh()->inventoryItem->stock_on_hand)->toBe(48)
            ->and($b['staff']->fresh()->role)->toBe(Role::Staff)
            ->and($b['staff']->fresh()->is_active)->toBeTrue()
            ->and(Customer::query()->whereKey($b['customer']->id)->exists())->toBeTrue()
            ->and(Expense::query()->whereKey($b['expense']->id)->exists())->toBeTrue();
    });
});

/*
|--------------------------------------------------------------------------
| Every list, export and figure
|--------------------------------------------------------------------------
*/

it('never shows another business\'s data on any list, export or analytics endpoint', function (): void {
    otherBusiness();
    CurrentBusiness::get()->run(Business::query()->where('name', LEAK_MARKER.' Trading')->value('id'), fn () => MetricFixture::build());

    $this->actingAs($this->ownerA);

    // Parameters for the endpoints that refuse a bare request, so each one is
    // asked a real question rather than answering 422.
    $range = 'preset=custom&from='.MetricFixture::FROM.'&to='.MetricFixture::TO;
    $queries = [
        'api/v1/analytics/breakdown' => "{$range}&dimension=customer&metric=net_revenue",
        'api/v1/analytics/timeseries' => "{$range}&metric=net_revenue&grain=day",
        'api/v1/analytics/summary' => $range,
        'api/v1/analytics/vat' => $range,
        'api/v1/dashboard' => $range,
        'api/v1/insights' => $range,
    ];

    $checked = 0;

    foreach (apiRoutes() as $route) {
        if ($route->parameterNames() !== [] || ! in_array('GET', $route->methods(), true)) {
            continue;
        }

        $uri = '/'.$route->uri().(isset($queries[$route->uri()]) ? '?'.$queries[$route->uri()] : '');
        $response = $this->getJson($uri);

        $status = $response->baseResponse->getStatusCode();

        expect($status)->toBeLessThan(400, "GET {$uri} answered {$status}")
            // toContain() takes several needles, so the message goes on toBeFalse().
            ->and(str_contains(bodyOf($response), LEAK_MARKER))->toBeFalse("GET {$uri} showed another business's data");
        $checked++;
    }

    // The breakdowns name products and customers; ask for those too.
    foreach (['product', 'category'] as $dimension) {
        expect(bodyOf($this->getJson("/api/v1/analytics/breakdown?{$range}&dimension={$dimension}&metric=net_revenue")))
            ->not->toContain(LEAK_MARKER);
    }

    expect($checked)->toBeGreaterThanOrEqual(20);
});

it('reports exactly the same figures whatever another business does', function (): void {
    MetricFixture::build();
    $this->actingAs($this->ownerA);

    $range = 'preset=custom&from='.MetricFixture::FROM.'&to='.MetricFixture::TO;
    $urls = [
        "/api/v1/analytics/summary?{$range}",
        "/api/v1/analytics/timeseries?{$range}&metric=net_revenue&grain=day",
        "/api/v1/analytics/timeseries?{$range}&metric=operating_expenses&grain=day",
        "/api/v1/analytics/breakdown?{$range}&dimension=product&metric=gross_profit",
        "/api/v1/analytics/breakdown?{$range}&dimension=customer&metric=net_revenue",
        "/api/v1/analytics/vat?{$range}",
        "/api/v1/dashboard?{$range}",
        "/api/v1/insights?{$range}",
    ];

    $capture = fn (): array => array_map(fn (string $url): mixed => $this->getJson($url)->assertOk()->json(), $urls);

    $alone = $capture();

    // Business B: the same fixture on the same dates, plus a second business's
    // worth of noise. A single leaked row anywhere moves a figure.
    $b = otherBusiness();
    CurrentBusiness::get()->run($b['business']->id, fn () => MetricFixture::build());

    $this->actingAs($this->ownerA);

    expect($capture())->toEqual($alone)
        ->and($alone[0]['data']['net_revenue']['value'] ?? null)->toBe(MetricFixture::EXPECTED['net_revenue']);
});

/*
|--------------------------------------------------------------------------
| Validation that accepts an id
|--------------------------------------------------------------------------
*/

it('refuses another business\'s ids in every field that takes one', function (): void {
    $b = otherBusiness();
    $this->actingAs($this->ownerA);

    $this->postJson('/api/v1/orders', ['customer_id' => $b['customer']->id])
        ->assertUnprocessable()->assertJsonValidationErrors('customer_id');

    $draft = Order::factory()->create();

    $this->patchJson("/api/v1/orders/{$draft->id}", ['customer_id' => $b['customer']->id])
        ->assertUnprocessable()->assertJsonValidationErrors('customer_id');

    $this->postJson("/api/v1/orders/{$draft->id}/items", ['product_id' => $b['product']->id, 'quantity' => 1])
        ->assertUnprocessable()->assertJsonValidationErrors('product_id');

    $this->postJson('/api/v1/products', [
        'sku' => 'OWN-1', 'name' => 'Own', 'price' => 10, 'cost' => 5,
        'category_id' => $b['product']->category_id ?? CurrentBusiness::get()->run($b['business']->id, fn () => Category::factory()->create()->id),
    ])->assertUnprocessable()->assertJsonValidationErrors('category_id');

    $this->postJson('/api/v1/expenses', [
        'expense_category_id' => $b['category']->id, 'description' => 'x', 'amount' => 10, 'incurred_on' => now()->toDateString(),
    ])->assertUnprocessable()->assertJsonValidationErrors('expense_category_id');
});

it('lets two businesses use the same SKU, customer email and order numbers', function (): void {
    $b = otherBusiness();
    $this->actingAs($this->ownerA);

    $this->postJson('/api/v1/products', ['sku' => 'LEAK-1', 'name' => 'Ours', 'price' => 10, 'cost' => 5])->assertCreated();
    $this->postJson('/api/v1/customers', ['name' => 'Ours', 'email' => 'leak@other.test'])->assertCreated();

    // Each business numbers its own orders from one.
    $ours = $this->postJson('/api/v1/orders', [])->assertCreated()->json('data.reference');
    $theirs = CurrentBusiness::get()->run($b['business']->id, fn () => OrderReference::createOrder([])->reference);

    expect($ours)->toBe('ORD-'.now()->year.'-000001')
        ->and($theirs)->toBe($ours);
});

it('keeps the last-owner guard inside one business', function (): void {
    // B has owners of its own; they must not count as A's second owner.
    otherBusiness();
    $this->actingAs($this->ownerA);

    $this->postJson("/api/v1/users/{$this->ownerA->id}/role", ['role' => 'manager'])->assertStatus(409);

    expect($this->ownerA->fresh()->role)->toBe(Role::Owner);
});

/*
|--------------------------------------------------------------------------
| No raw table access outside the tenancy layer
|--------------------------------------------------------------------------
*/

it('reaches business tables only through the tenancy layer', function (): void {
    $allowed = [
        str_replace('/', DIRECTORY_SEPARATOR, 'app/Support/Tenancy/TenantQuery.php'),
        // Framework tables that belong to no business.
        str_replace('/', DIRECTORY_SEPARATOR, 'app/Http/Controllers/Api/V1/HealthController.php'),
    ];

    $offenders = [];
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(base_path('app')));

    foreach ($files as $file) {
        if ($file->getExtension() !== 'php') {
            continue;
        }

        $relative = substr($file->getPathname(), strlen(base_path()) + 1);

        if (in_array($relative, $allowed, true)) {
            continue;
        }

        // Correlated subqueries (whereExists on customers.id, and the like)
        // are reached from an already-filtered row and are not listed here.
        if (preg_match('/DB::table\(|DB::select\(/', (string) file_get_contents($file->getPathname())) === 1) {
            $offenders[] = $relative;
        }
    }

    expect($offenders)->toBe([], 'Use TenantQuery::table() instead of raw table access in: '.implode(', ', $offenders));
});
