<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Export\CsvExport;
use App\Domain\Inventory\AdjustStock;
use App\Domain\Inventory\StockLedger;
use App\Domain\Inventory\StockLevel;
use App\Http\Controllers\Controller;
use App\Http\Requests\Products\StoreProductRequest;
use App\Http\Requests\Products\UpdateProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Support\Money;
use App\Support\QueryFilter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Products.
 *
 * Controllers authorize, hand validated input to a service or model, and return
 * a resource. No business logic, no arithmetic, no transactions beyond the
 * trivial (ARCHITECTURE.md §2).
 */
class ProductController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Product::class);

        $listing = $this->listing($request);

        // Totalled before the page is taken, and from a CLONE: `paginate`
        // mutates the builder it is called on.
        $totals = self::totals($request, clone $listing);

        return ProductResource::collection(
            $listing->paginate(QueryFilter::perPage($request))->withQueryString(),
        )->additional(['totals' => $totals]);
    }

    /**
     * What the filtered catalogue comes to.
     *
     * `products` is the count of every row that matched, not the page.
     *
     * `stock_value` is the money sitting on the shelves: units on hand times
     * what each one cost to buy. It is the figure a catalogue screen exists
     * to answer and the product had no way to show it — an owner scanning
     * forty rows of price and cost could not tell whether that was ten
     * thousand dinars of stock or a hundred.
     *
     * AT COST, NOT AT PRICE, and the distinction is the whole point. Stock
     * valued at its selling price books a profit nobody has earned yet, on
     * goods that may never sell. What the business has tied up is what it
     * paid.
     *
     * Withheld as a set from a role that cannot see cost, exactly as the
     * column is — and more carefully, because one number covering the whole
     * catalogue discloses more than any single row.
     *
     * @param  Builder<Product>  $query
     * @return array<string, int|string>
     */
    private static function totals(Request $request, Builder $query): array
    {
        $totals = ['products' => (int) (clone $query)->reorder()->toBase()->count()];

        if ($request->user()?->can(Ability::ProductsViewCost->value) === true) {
            /*
             * Joined rather than summed through the relation: `withSum` would
             * need the product of two columns from two tables, which is not
             * something a relation aggregate can express.
             */
            $value = (clone $query)
                ->reorder()
                ->join('inventory_items', 'inventory_items.product_id', '=', 'products.id')
                ->toBase()
                ->selectRaw('COALESCE(SUM(inventory_items.stock_on_hand * products.cost), 0) AS value')
                ->value('value');

            $totals['stock_value'] = Money::round((string) ($value ?: '0'));
        }

        return $totals;
    }

    /**
     * The filtered query behind BOTH the screen and the CSV export.
     *
     * One definition on purpose. SECURITY.md §9.2 requires an export to run
     * through the same scope, policies and redaction as the screen it comes
     * from; a second query written beside the first is a second place for a
     * filter to be forgotten, and the forgotten one is always the export.
     *
     * @return Builder<Product>
     */
    private function listing(Request $request): Builder
    {
        $filter = new QueryFilter(
            filters: [
                'search' => QueryFilter::search(['name', 'sku']),
                'category_id' => QueryFilter::exact('category_id'),
                'is_active' => QueryFilter::boolean('is_active'),
                'low_stock' => fn ($query, string $value) => filter_var($value, FILTER_VALIDATE_BOOLEAN)
                    ? $query->whereHas(
                        'inventoryItem',
                        fn ($q) => $q->tap(fn ($inner) => StockLevel::whereLow($inner)),
                    )
                    : $query,
            ],
            sortable: ['name', 'sku', 'price', 'created_at'],
            defaultSort: 'name',
        );

        /** @var Builder<Product> $query */
        /*
         * `inventoryItem.product` as well as `inventoryItem`: the low-stock
         * threshold reads back through the inverse relation, so without it
         * every row fired a query of its own — 25 on a page, and one per
         * product on a full export.
         */
        $query = $filter->apply(
            Product::query()->with(['category', 'inventoryItem.product']),
            $request,
        );

        return $query;
    }

    public function export(Request $request, CsvExport $export): StreamedResponse
    {
        $this->authorize('export', Product::class);

        return $export->stream(
            query: $this->listing($request),
            resource: ProductResource::class,
            columns: [
                'sku' => __('labels.csv.sku'),
                'name' => __('labels.csv.name'),
                'category.name' => __('labels.csv.category'),
                'unit' => __('labels.csv.unit'),
                'price' => __('labels.csv.price'),
                // Omitted by ProductResource for a role without
                // products.view_cost, and therefore never written.
                'cost' => __('labels.csv.cost'),
                'stock.on_hand' => __('labels.csv.stock_on_hand'),
                'stock.reorder_point' => __('labels.csv.reorder_point'),
                'is_active' => __('labels.csv.active'),
            ],
            request: $request,
            filename: 'products',
        );
    }

    public function store(StoreProductRequest $request): JsonResponse
    {
        $data = $request->validated();
        $openingStock = (int) ($data['opening_stock'] ?? 0);
        unset($data['opening_stock']);

        $product = DB::transaction(function () use ($data, $request): Product {
            $product = new Product($data);
            // sku is immutable and therefore not fillable — set once, here.
            $product->sku = $data['sku'];
            $product->created_by = $request->user()?->id;
            $product->save();

            app(StockLedger::class)->createItemForProduct(
                $product,
                (int) ($data['low_stock_threshold'] ?? 0),
            );

            return $product;
        });

        // Opening stock goes through the ledger like every other movement, so
        // the invariant holds from the product's first moment.
        if ($openingStock > 0) {
            app(AdjustStock::class)->adjust(
                product: $product,
                delta: $openingStock,
                note: 'Opening stock',
                reason: InventoryMovement::REASON_INITIAL,
                actorId: $request->user()?->id,
            );
        }

        return ProductResource::make($product->load(['category', 'inventoryItem']))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Product $product): ProductResource
    {
        $this->authorize('view', $product);

        return ProductResource::make($product->load(['category', 'inventoryItem']));
    }

    public function update(UpdateProductRequest $request, Product $product): ProductResource
    {
        /*
         * A price or cost change affects FUTURE orders only. Past order_items
         * hold their own snapshots and are untouched by this — which is what
         * ConfirmOrderTest asserts (MVP_SCOPE.md §6.5).
         */
        $product->update($request->validated());

        return ProductResource::make($product->fresh()->load(['category', 'inventoryItem']));
    }

    public function activate(Request $request, Product $product): ProductResource
    {
        $this->authorize('deactivate', $product);

        $product->forceFill(['is_active' => true])->save();

        return ProductResource::make($product->load(['category', 'inventoryItem']));
    }

    public function deactivate(Request $request, Product $product): ProductResource
    {
        $this->authorize('deactivate', $product);

        // Deactivated, never deleted: the product stays fully visible in
        // analytics and its historical order lines keep resolving.
        $product->forceFill(['is_active' => false])->save();

        return ProductResource::make($product->load(['category', 'inventoryItem']));
    }
}
