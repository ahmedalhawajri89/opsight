<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Export\CsvExport;
use App\Domain\Orders\CancelOrder;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\FulfilOrder;
use App\Domain\Orders\OrderReference;
use App\Domain\Orders\OrderStatus;
use App\Domain\Orders\RecordRefund;
use App\Http\Controllers\Controller;
use App\Http\Requests\Orders\AddOrderItemRequest;
use App\Http\Requests\Orders\StoreOrderRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Support\QueryFilter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Order::class);

        return OrderResource::collection(
            $this->listing($request)
                ->paginate(QueryFilter::perPage($request))
                ->withQueryString(),
        );
    }

    public function export(Request $request, CsvExport $export): StreamedResponse
    {
        // A separate ability from orders.view. Reading a page and extracting
        // the whole dataset are different risks (SECURITY.md §9.1).
        $this->authorize('export', Order::class);

        return $export->stream(
            query: $this->listing($request),
            resource: OrderResource::class,
            columns: [
                'reference' => 'Reference',
                'status_label' => 'Status',
                'placed_at' => 'Placed at',
                'customer.name' => 'Customer',
                'customer.email' => 'Customer email',
                'subtotal_amount' => 'Subtotal',
                'discount_amount' => 'Discount',
                'tax_amount' => 'Tax',
                'shipping_amount' => 'Shipping',
                'total_amount' => 'Total',
                'refunded_amount' => 'Refunded',
                /*
                 * Dropped automatically for a role without orders.view_margin:
                 * OrderResource omits both keys, so CsvExport never sees them
                 * and the columns are not written. Listing them here is safe
                 * precisely because presence is decided by the resource and
                 * not by this array.
                 */
                'cogs_amount' => 'Cost of goods',
                'gross_profit' => 'Gross profit',
            ],
            request: $request,
            filename: 'orders',
        );
    }

    /**
     * The filtered query behind BOTH the screen and the CSV export.
     *
     * One definition on purpose. SECURITY.md §9.2 requires an export to run
     * through the same scope, policies and redaction as the screen it comes
     * from; a second query written beside the first is a second place for a
     * filter to be forgotten, and the forgotten one is always the export.
     *
     * @return Builder<Order>
     */
    private function listing(Request $request): Builder
    {
        $filter = new QueryFilter(
            filters: [
                'status' => QueryFilter::exact('status'),
                'customer_id' => QueryFilter::exact('customer_id'),
                'created_by' => QueryFilter::exact('created_by'),
                'search' => QueryFilter::search(['reference']),
                // Ranges on the business date, which is what an operator means
                // by "orders in August".
                'placed_from' => QueryFilter::dateFrom('placed_at'),
                'placed_to' => QueryFilter::dateTo('placed_at'),
            ],
            sortable: ['reference', 'placed_at', 'total_amount', 'status', 'created_at'],
            defaultSort: '-created_at',
        );

        /** @var Builder<Order> $query */
        $query = $filter->apply(Order::query()->with(['customer']), $request);

        return $query;
    }

    public function store(StoreOrderRequest $request): JsonResponse
    {
        $order = OrderReference::createOrder($request->validated(), $request->user()?->id);

        return OrderResource::make($order->load(['customer', 'items']))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Order $order): OrderResource
    {
        $this->authorize('view', $order);

        return OrderResource::make($order->load(['customer', 'items', 'creator']));
    }

    public function update(Request $request, Order $order): OrderResource
    {
        // The policy enforces draft-only AND own-drafts-only for Staff.
        $this->authorize('update', $order);

        $validated = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'shipping_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $order->update($validated);

        return OrderResource::make($order->fresh()->load(['customer', 'items']));
    }

    public function destroy(Request $request, Order $order): JsonResponse
    {
        // Draft-only, enforced by the policy. A committed order is never
        // deleted — it is cancelled, and stays on record.
        $this->authorize('delete', $order);

        $order->delete();

        return response()->json(null, 204);
    }

    /* ---------------------------------------------------------------------- */
    /* Line items */
    /* ---------------------------------------------------------------------- */

    public function addItem(AddOrderItemRequest $request, Order $order): JsonResponse
    {
        $data = $request->validated();
        $product = Product::findOrFail($data['product_id']);

        /*
         * The snapshot columns are filled provisionally here so the draft can
         * be displayed with plausible figures. They are OVERWRITTEN at confirm
         * from the catalog as it stands at that moment — confirm is the
         * commitment point, not this.
         */
        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'unit_price' => $product->price,
            'unit_cost' => $product->cost,
            'quantity' => $data['quantity'],
            'line_discount' => $data['line_discount'] ?? 0,
            'line_total' => 0,
        ]);

        return OrderResource::make($order->fresh()->load(['customer', 'items']))
            ->response()
            ->setStatusCode(201);
    }

    public function removeItem(Request $request, Order $order, OrderItem $item): JsonResponse
    {
        $this->authorize('update', $order);

        /*
         * IDOR: resolving the item by id proves it exists, nothing more. It
         * must also belong to THIS order, or a permitted order's URL becomes a
         * way to delete someone else's line (SECURITY.md §5.2).
         */
        if ($item->order_id !== $order->id) {
            abort(404);
        }

        $item->delete();

        return response()->json(null, 204);
    }

    /* ---------------------------------------------------------------------- */
    /* State transitions */
    /* ---------------------------------------------------------------------- */

    public function confirm(Request $request, Order $order, ConfirmOrder $confirm): OrderResource
    {
        $this->authorize('confirm', $order);

        return OrderResource::make(
            $confirm($order, $request->user()?->id)->load(['customer', 'items']),
        );
    }

    public function fulfil(Request $request, Order $order, FulfilOrder $fulfil): OrderResource
    {
        $this->authorize('fulfil', $order);

        return OrderResource::make($fulfil($order)->load(['customer', 'items']));
    }

    public function cancel(Request $request, Order $order, CancelOrder $cancel): OrderResource
    {
        $this->authorize('cancel', $order);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        return OrderResource::make(
            $cancel($order, $validated['reason'], $request->user()?->id)->load(['customer', 'items']),
        );
    }

    public function refund(Request $request, Order $order, RecordRefund $refund): OrderResource
    {
        $this->authorize('refund', $order);

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'return_stock' => ['nullable', 'boolean'],
        ]);

        if ($order->status !== OrderStatus::Fulfilled) {
            throw ValidationException::withMessages([
                'amount' => 'Only a fulfilled order can be refunded.',
            ]);
        }

        return OrderResource::make(
            $refund(
                $order,
                (string) $validated['amount'],
                (bool) ($validated['return_stock'] ?? true),
                $request->user()?->id,
            )->load(['customer', 'items']),
        );
    }
}
