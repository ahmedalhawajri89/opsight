<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Export\CsvExport;
use App\Domain\Inventory\AdjustStock;
use App\Domain\Inventory\StockLevel;
use App\Http\Controllers\Controller;
use App\Http\Resources\InventoryItemResource;
use App\Http\Resources\InventoryMovementResource;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Support\Money;
use App\Support\QueryFilter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InventoryController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', InventoryItem::class);

        $listing = $this->listing($request);

        // Totalled before the page is taken, and from a CLONE: `paginate`
        // mutates the builder it is called on.
        $totals = self::totals($request, clone $listing);

        return InventoryItemResource::collection(
            $listing->paginate(QueryFilter::perPage($request))->withQueryString(),
        )->additional(['totals' => $totals]);
    }

    /**
     * The two questions this screen is opened to answer.
     *
     * `low` is how many of the matched lines are at or under their reorder
     * point — the one figure that turns a stock list into a to-do list, and
     * the reader had to count the amber rows by eye to get it. It runs the
     * SAME `StockLevel::whereLow` the rows and the filter use, so the badge
     * on a row and the count above it can never disagree.
     *
     * `value` is what the goods on the shelves cost. At cost, never at the
     * selling price: stock valued at what it might fetch books a profit
     * nobody has earned on goods that may never sell. Withheld as a set from
     * a role that cannot see cost, and more carefully than a column is —
     * one number over the whole warehouse discloses more than any row.
     *
     * @param  Builder<InventoryItem>  $query
     * @return array<string, int|string>
     */
    private static function totals(Request $request, Builder $query): array
    {
        $totals = [
            'items' => (int) (clone $query)->reorder()->toBase()->count(),
            'low' => (int) (clone $query)->reorder()->tap(StockLevel::whereLow(...))->toBase()->count(),
        ];

        if ($request->user()?->can(Ability::ProductsViewCost->value) === true) {
            $value = (clone $query)
                ->reorder()
                ->join('products', 'products.id', '=', 'inventory_items.product_id')
                ->toBase()
                ->selectRaw('COALESCE(SUM(inventory_items.stock_on_hand * products.cost), 0) AS value')
                ->value('value');

            $totals['value'] = Money::round((string) ($value ?: '0'));
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
     * @return Builder<InventoryItem>
     */
    private function listing(Request $request): Builder
    {
        $filter = new QueryFilter(
            filters: [
                'search' => fn ($query, string $term) => $query->whereHas(
                    'product',
                    fn ($q) => $q->where('name', 'like', "%{$term}%")->orWhere('sku', 'like', "%{$term}%"),
                ),
                'low_stock' => fn ($query, string $value) => filter_var($value, FILTER_VALIDATE_BOOLEAN)
                    ? $query->tap(fn ($q) => StockLevel::whereLow($q))
                    : $query,
            ],
            sortable: ['stock_on_hand', 'last_movement_at'],
            defaultSort: 'stock_on_hand',
        );

        /** @var Builder<InventoryItem> $query */
        $query = $filter->apply(
            InventoryItem::query()
                ->with('product')
                ->whereHas('product', fn ($q) => $q->whereNull('deleted_at')),
            $request,
        );

        return $query;
    }

    public function export(Request $request, CsvExport $export): StreamedResponse
    {
        $this->authorize('export', InventoryItem::class);

        return $export->stream(
            query: $this->listing($request),
            resource: InventoryItemResource::class,
            columns: [
                'product.sku' => __('labels.csv.sku'),
                'product.name' => __('labels.csv.product'),
                'product.unit' => __('labels.csv.unit'),
                'stock_on_hand' => __('labels.csv.stock_on_hand'),
                'reorder_point' => __('labels.csv.reorder_point'),
                'is_low' => __('labels.csv.below_reorder_point'),
                'last_movement_at' => __('labels.csv.last_movement'),
            ],
            request: $request,
            filename: 'inventory',
        );
    }

    /**
     * Products at or below their reorder point.
     *
     * A POINT-IN-TIME view: it reflects now, not the selected period, and the
     * UI labels it that way (METRICS.md §2.18).
     */
    public function lowStock(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', InventoryItem::class);

        return InventoryItemResource::collection(
            InventoryItem::query()
                ->with('product')
                ->whereHas('product', fn ($q) => $q->whereNull('deleted_at')->where('is_active', true))
                ->tap(fn ($query) => StockLevel::whereLow($query))
                ->orderBy('stock_on_hand')
                ->paginate(QueryFilter::perPage($request)),
        );
    }

    /** The ledger for one product — the audit trail behind its current stock. */
    public function movements(Request $request, Product $product): AnonymousResourceCollection
    {
        $this->authorize('viewAny', InventoryItem::class);

        return InventoryMovementResource::collection(
            $product->movements()
                ->with('creator')
                ->orderByDesc('occurred_at')
                ->orderByDesc('id')
                ->paginate(QueryFilter::perPage($request)),
        );
    }

    public function adjust(Request $request, Product $product, AdjustStock $adjust): InventoryItemResource
    {
        $this->authorize('adjust', InventoryItem::class);

        $validated = $request->validate([
            // A DELTA, not a target. "Set stock to 40" is ambiguous under
            // concurrency and leaves no record of what changed.
            'quantity_delta' => ['required', 'integer', 'not_in:0'],
            'note' => ['required', 'string', 'min:3', 'max:255'],
            'reason' => ['nullable', Rule::in([
                InventoryMovement::REASON_ADJUSTMENT,
                InventoryMovement::REASON_DAMAGE,
                InventoryMovement::REASON_LOSS,
            ])],
        ]);

        $adjust->adjust(
            product: $product,
            delta: (int) $validated['quantity_delta'],
            note: $validated['note'],
            reason: $validated['reason'] ?? InventoryMovement::REASON_ADJUSTMENT,
            actorId: $request->user()?->id,
        );

        return InventoryItemResource::make($product->inventoryItem()->with('product')->first());
    }

    public function restock(Request $request, Product $product, AdjustStock $adjust): InventoryItemResource
    {
        $this->authorize('restock', InventoryItem::class);

        $validated = $request->validate([
            'quantity' => ['required', 'integer', 'min:1'],
            'unit_cost' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        /*
         * This never creates an expense row. Stock purchases reach profit
         * through COGS at the point of sale; recording them as an expense too
         * would double-count them (MVP_SCOPE.md §6.7).
         */
        $adjust->restock(
            product: $product,
            quantity: (int) $validated['quantity'],
            unitCost: isset($validated['unit_cost']) ? (string) $validated['unit_cost'] : null,
            note: $validated['note'] ?? null,
            actorId: $request->user()?->id,
        );

        return InventoryItemResource::make($product->inventoryItem()->with('product')->first());
    }
}
