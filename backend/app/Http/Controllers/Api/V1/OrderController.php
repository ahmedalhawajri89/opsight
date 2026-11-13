<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Export\CsvExport;
use App\Domain\Orders\CancelOrder;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\FulfilOrder;
use App\Domain\Orders\OrderReference;
use App\Domain\Orders\OrderStatus;
use App\Domain\Orders\OrderTransitionException;
use App\Domain\Orders\RecordRefund;
use App\Domain\Payments\PaymentMethod;
use App\Domain\Payments\PaymentStatus;
use App\Domain\Payments\RecordPayment;
use App\Http\Controllers\Controller;
use App\Http\Requests\Orders\AddOrderItemRequest;
use App\Http\Requests\Orders\StoreOrderRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Support\Money;
use App\Support\QueryFilter;
use App\Support\Tenancy\TenantRule;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Order::class);

        $listing = $this->listing($request);

        // Totalled before the page is taken, and from a CLONE: `paginate`
        // mutates the builder it is called on.
        $totals = self::totals($request, clone $listing);

        return OrderResource::collection(
            $listing->paginate(QueryFilter::perPage($request))->withQueryString(),
        )->additional(['totals' => $totals]);
    }

    /**
     * What the filtered set adds up to — every row that matched, not the page.
     *
     * WHY THIS IS NOT THE ANALYTICS FIGURE, AND MUST NOT BE. `MetricCalculator`
     * defines net revenue as subtotal less discounts less refunds, over
     * qualifying statuses only, and the Analytics screen reports it under its
     * own name. This sums `total_amount` over whatever the reader's filters
     * matched, because it is printed directly above a table of `total_amount`
     * and a band that disagrees with the column under it is worse than no band
     * at all. The two carry different names for that reason.
     *
     * So the status filter is the reader's, not ours: ask for cancelled orders
     * and the total is the total of cancelled orders. A hidden status
     * restriction would mean the band quietly answered a different question
     * from the one the filters asked.
     *
     * Gross profit repeats the row's own expression (OrderResource) rather
     * than the calculator's, for the same reason — the band is the column's
     * sum. It is withheld whole from a role without the ability, exactly as
     * the column is.
     *
     * One query, and no ORDER BY: `reorder()` drops the sort, which an
     * aggregate cannot use and the engine would otherwise still plan for.
     * `toBase()` keeps the tenancy scope, because Eloquent applies its scopes
     * on the way down to the query builder.
     *
     * @param  Builder<Order>  $query
     * @return array<string, int|string>
     */
    private static function totals(Request $request, Builder $query): array
    {
        $scale = Money::scale();

        $row = $query->reorder()->toBase()->selectRaw(
            'COUNT(*) AS orders, '
            .'COALESCE(SUM(total_amount), 0) AS sales, '
            .'COALESCE(SUM(subtotal_amount), 0) AS subtotal, '
            .'COALESCE(SUM(discount_amount), 0) AS discounts, '
            .'COALESCE(SUM(cogs_amount), 0) AS cogs'
        )->first();

        $totals = [
            'orders' => (int) ($row->orders ?? 0),
            'sales' => Money::round((string) ($row->sales ?? '0')),
        ];

        // Withheld as a set, like every other margin figure.
        if ($request->user()?->can(Ability::OrdersViewMargin->value) === true) {
            $totals['gross_profit'] = bcsub(
                bcsub((string) ($row->subtotal ?? '0'), (string) ($row->discounts ?? '0'), $scale),
                (string) ($row->cogs ?? '0'),
                $scale,
            );
        }

        return $totals;
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
                'reference' => __('labels.csv.reference'),
                'status_label' => __('labels.csv.status'),
                'placed_at' => __('labels.csv.placed_at'),
                'customer.name' => __('labels.csv.customer'),
                'customer.email' => __('labels.csv.customer_email'),
                'subtotal_amount' => __('labels.csv.subtotal'),
                'discount_amount' => __('labels.csv.discount'),
                'tax_amount' => __('labels.csv.tax'),
                'shipping_amount' => __('labels.csv.shipping'),
                'total_amount' => __('labels.csv.total'),
                'refunded_amount' => __('labels.csv.refunded'),
                'amount_paid' => __('labels.csv.amount_paid'),
                'outstanding_amount' => __('labels.csv.outstanding'),
                'payment_status_label' => __('labels.csv.payment_status'),
                /*
                 * Dropped automatically for a role without orders.view_margin:
                 * OrderResource omits both keys, so CsvExport never sees them
                 * and the columns are not written. Listing them here is safe
                 * precisely because presence is decided by the resource and
                 * not by this array.
                 */
                'cogs_amount' => __('labels.csv.cogs'),
                'gross_profit' => __('labels.csv.gross_profit'),
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
                'payment_status' => self::paymentStatusFilter(...),
            ],
            sortable: ['reference', 'placed_at', 'total_amount', 'status', 'created_at'],
            defaultSort: '-created_at',
        );

        /** @var Builder<Order> $query */
        $query = $filter->apply(Order::query()->with(['customer']), $request);

        return $query;
    }

    /**
     * Payment status is derived, so it is filtered in SQL on the same formula
     * PaymentStatus uses, and only over committed orders: a draft owes
     * nothing (ADR-022).
     *
     * @param  Builder<covariant Model>  $query
     */
    private static function paymentStatusFilter(Builder $query, string $value): void
    {
        $payment = PaymentStatus::tryFrom($value);

        if ($payment === null) {
            throw ValidationException::withMessages([
                'filter' => __('errors.filter.malformed'),
            ]);
        }

        $outstanding = PaymentStatus::outstandingSql();
        $query->whereIn('status', OrderStatus::qualifying());

        match ($payment) {
            PaymentStatus::Settled => $query->whereRaw("{$outstanding} = 0"),
            PaymentStatus::PartiallyPaid => $query->whereRaw("{$outstanding} > 0")->where('amount_paid', '>', 0),
            PaymentStatus::Unpaid => $query->whereRaw("{$outstanding} > 0")->where('amount_paid', '=', 0),
        };
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

        return OrderResource::make($order->load(['customer', 'items', 'creator', 'payments', 'refunds']));
    }

    public function update(Request $request, Order $order): OrderResource
    {
        // The policy enforces draft-only AND own-drafts-only for Staff.
        $this->authorize('update', $order);

        $validated = $request->validate([
            'customer_id' => ['nullable', 'integer', TenantRule::exists('customers')->whereNull('deleted_at')],
            'notes' => ['nullable', 'string', 'max:5000'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'shipping_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $this->whileDraft($order, static fn (Order $draft) => $draft->update($validated));

        return OrderResource::make($order->fresh()->load(['customer', 'items']));
    }

    public function destroy(Request $request, Order $order): JsonResponse
    {
        // Draft-only, enforced by the policy. A committed order is never
        // deleted — it is cancelled, and stays on record.
        $this->authorize('delete', $order);

        $this->whileDraft($order, static fn (Order $draft) => $draft->delete());

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
        $this->whileDraft($order, static fn (Order $draft) => $draft->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_name_ar' => $product->name_ar,
            'product_sku' => $product->sku,
            'unit_price' => $product->price,
            'unit_cost' => $product->cost,
            'quantity' => $data['quantity'],
            'line_discount' => $data['line_discount'] ?? 0,
            'line_total' => 0,
        ]));

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

        $this->whileDraft($order, static fn () => $item->delete());

        return response()->json(null, 204);
    }

    /**
     * An edit to a draft, made only while it is still one.
     *
     * The policy checks "draft only" against the order as route binding
     * loaded it, and confirming re-reads the order under a row lock
     * (ConfirmOrder). An edit sent at the same moment as a confirm could
     * therefore pass its check on the stale copy and land after the confirm
     * committed: a discount changed on a confirmed order without its total
     * being recomputed, or a line added to it with no stock moved (security
     * audit, 2026-11-13). So every edit takes the same lock and asks again.
     * Whichever of the two gets the row first wins, and the other sees the
     * order as it now is.
     *
     * @template T
     *
     * @param  Closure(Order): T  $edit
     * @return T
     */
    private function whileDraft(Order $order, Closure $edit): mixed
    {
        return DB::transaction(static function () use ($order, $edit): mixed {
            $locked = Order::query()->lockForUpdate()->findOrFail($order->id);

            if (! $locked->isEditable()) {
                throw OrderTransitionException::notEditable($locked->status);
            }

            return $edit($locked);
        });
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
            'amount' => ['required', 'numeric', 'min:0.001'],
            'return_stock' => ['nullable', 'boolean'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        // A fulfilled order takes its first refund; a refunded one can take
        // more, in parts, until nothing is left to return (ADR-022).
        if (! in_array($order->status, [OrderStatus::Fulfilled, OrderStatus::Refunded], true)) {
            throw ValidationException::withMessages([
                'amount' => __('errors.order.not_refundable'),
            ]);
        }

        return OrderResource::make(
            $refund(
                $order,
                (string) $validated['amount'],
                // Stock comes back with the first refund unless told otherwise,
                // and never twice.
                (bool) ($validated['return_stock'] ?? $order->stock_returned_at === null),
                $request->user()?->id,
                $validated['reason'] ?? null,
            )->load(['customer', 'items', 'payments', 'refunds']),
        );
    }

    public function recordPayment(Request $request, Order $order, RecordPayment $record): OrderResource
    {
        $this->authorize('recordPayment', $order);

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.001'],
            'method' => ['required', Rule::enum(PaymentMethod::class)],
            'paid_at' => ['nullable', 'date', 'before_or_equal:now'],
            'reference' => ['nullable', 'string', 'max:80'],
        ]);

        return OrderResource::make(
            $record(
                $order,
                (string) $validated['amount'],
                PaymentMethod::from($validated['method']),
                isset($validated['paid_at']) ? Carbon::parse($validated['paid_at']) : null,
                $validated['reference'] ?? null,
                $request->user()?->id,
            )->load(['customer', 'items', 'payments', 'refunds']),
        );
    }
}
