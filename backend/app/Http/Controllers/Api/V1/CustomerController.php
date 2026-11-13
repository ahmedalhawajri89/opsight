<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Compliance\EraseCustomer;
use App\Domain\Export\CsvExport;
use App\Domain\Export\CustomerDataExport;
use App\Domain\Orders\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\OrderResource;
use App\Models\Customer;
use App\Models\Order;
use App\Support\Money;
use App\Support\PhoneNumber;
use App\Support\QueryFilter;
use App\Support\Tenancy\TenantRule;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CustomerController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Customer::class);

        /*
         * Lifetime value is its own ability (customers.view_ltv), which Staff
         * do not hold (ROLES_AND_PERMISSIONS.md). It was computed, returned
         * and sortable for everyone with customers.view until the security
         * audit (2026-11-13) found the policy method written and never called.
         * Without it the figure is not computed, not totalled, and not a
         * column anyone can sort by — sorting by it would rank customers by
         * the very figure that is withheld.
         */
        $withValue = $request->user()?->can('viewLifetimeValue', Customer::class) ?? false;

        $filtered = $this->listing($request, $withValue);

        /*
         * Totalled from the PLAIN filtered query, before the per-row
         * subqueries are attached, and from a clone because `paginate`
         * mutates the builder it is called on.
         */
        $totals = self::totals(clone $filtered, $withValue);

        return CustomerResource::collection(
            self::withTrade($filtered, $withValue)->paginate(QueryFilter::perPage($request))->withQueryString(),
        )->additional(['totals' => $totals]);
    }

    /**
     * What each customer has actually traded — counted, never stored.
     *
     * The resource has carried a note since Phase 02 saying order counts and
     * lifetime value are metrics rather than columns, computed from orders so
     * they can never go stale. The principle was right and nothing ever
     * delivered on it: the screen's own description promised order history,
     * lifetime value and growth, and the table under it showed an email
     * address, a company, a country and a date added — of which, on the demo
     * data, `company` is null for all sixty-eight customers and `country` is
     * the same two letters for all sixty-eight. Two of its four columns
     * carried no information at all, and none of the three it advertised.
     *
     * These are correlated subqueries on the one listing query, so the page
     * costs no extra round trip per row, and they stay sortable — which is
     * the point of putting value in a column rather than on a detail page.
     * Sorting an address book by "date added" answers nothing; sorting a
     * customer list by what each one is worth is the reason to open it.
     *
     * QUALIFYING STATUSES ONLY, and this is a different rule from the band on
     * the orders screen deliberately. That one totals whatever the reader
     * filtered, because it is printed above the column it sums. This is a
     * claim about a relationship — a cancelled order is not value received,
     * and counting it would overstate every customer who ever cancelled.
     *
     * @param  Builder<Customer>  $query
     * @return Builder<Customer>
     */
    private static function withTrade(Builder $query, bool $withValue): Builder
    {
        $qualifying = fn (QueryBuilder|EloquentBuilder $orders) => $orders
            ->whereIn('status', OrderStatus::qualifying());

        $query
            ->withCount(['orders as orders_count' => $qualifying])
            ->withMax(['orders as last_order_at' => $qualifying], 'placed_at');

        if ($withValue) {
            $query->withSum(['orders as lifetime_value' => $qualifying], 'total_amount');
        }

        return $query;
    }

    /**
     * What the filtered set of customers comes to.
     *
     * Counted over every row that matched, not the page — see the same note
     * on OrderController::totals. `lifetime_value` here is the trade of the
     * whole matched set, which is the figure that makes a filtered customer
     * list worth filtering.
     *
     * @param  Builder<Customer>  $query
     * @return array<string, int|string>
     */
    private static function totals(Builder $query, bool $withValue): array
    {
        $customers = (int) (clone $query)->reorder()->toBase()->count();

        if (! $withValue) {
            return ['customers' => $customers];
        }

        /*
         * Summed from the orders table against the matched customers, NOT by
         * aggregating `withTrade`'s per-row alias. An alias on a SELECT list
         * cannot be aggregated in the same statement — the first version of
         * this asked MySQL for SUM(lifetime_value) and got "Unknown column
         * 'lifetime_value' in 'field list'" on the first request.
         *
         * Walk-in orders carry no customer_id and so fall outside this, which
         * is right: the figure is what the matched CUSTOMERS have traded.
         */
        $value = Order::query()
            ->whereIn('status', OrderStatus::qualifying())
            ->whereIn('customer_id', (clone $query)->reorder()->select('customers.id'))
            ->sum('total_amount');

        return [
            'customers' => $customers,
            'lifetime_value' => Money::round((string) ($value ?: '0')),
        ];
    }

    public function export(Request $request, CsvExport $export): StreamedResponse
    {
        /*
         * The customer list is the single most sensitive export in the system
         * — it is the business's entire commercial relationship map, and the
         * one file a departing employee has a motive to take.
         */
        $this->authorize('export', Customer::class);

        return $export->stream(
            // The export carries no trade columns, so no value to sort by either.
            query: $this->listing($request, false),
            resource: CustomerResource::class,
            columns: [
                'name' => __('labels.csv.name'),
                'company' => __('labels.csv.company'),
                'email' => __('labels.csv.email'),
                'phone' => __('labels.csv.phone'),
                'address_line' => __('labels.csv.address'),
                'city' => __('labels.csv.city'),
                'country' => __('labels.csv.country'),
                'is_active' => __('labels.csv.active'),
                'created_at' => __('labels.csv.created_at'),
            ],
            request: $request,
            filename: 'customers',
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
     * @return Builder<Customer>
     */
    private function listing(Request $request, bool $withValue): Builder
    {
        $filter = new QueryFilter(
            filters: [
                'search' => QueryFilter::search(['name', 'email', 'company', 'phone']),
                'is_active' => QueryFilter::boolean('is_active'),
                'country' => QueryFilter::exact('country'),
            ],
            // The trade columns sort too — a customer list is opened to find
            // the biggest, the quietest, the ones who stopped. They are
            // subquery aliases from `withTrade`, which MySQL sorts on happily.
            sortable: $withValue
                ? ['name', 'email', 'created_at', 'orders_count', 'lifetime_value', 'last_order_at']
                : ['name', 'email', 'created_at', 'orders_count', 'last_order_at'],
            defaultSort: 'name',
        );

        /** @var Builder<Customer> $query */
        $query = $filter->apply(Customer::query(), $request);

        return $query;
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Customer::class);

        $customer = new Customer($this->normalized($this->rules($request)));
        $customer->created_by = $request->user()?->id;
        $customer->save();

        return CustomerResource::make($customer)->response()->setStatusCode(201);
    }

    public function show(Request $request, Customer $customer): CustomerResource
    {
        $this->authorize('view', $customer);

        return CustomerResource::make($customer);
    }

    public function update(Request $request, Customer $customer): CustomerResource
    {
        $this->authorize('update', $customer);

        $customer->update($this->normalized($this->rules($request, $customer), $customer));

        return CustomerResource::make($customer->fresh());
    }

    public function destroy(Request $request, Customer $customer): JsonResponse
    {
        // The policy refuses when the customer has committed orders — removing
        // them must not rewrite history.
        $this->authorize('delete', $customer);

        $customer->delete();   // soft

        return response()->json(null, 204);
    }

    /**
     * Everything held about one person, for a data-subject request (ADR-026).
     *
     * Gated by `customers.export`, not a new ability: the payload is a strict
     * subset of what the customer list export plus this customer's order
     * history already release to the same three roles. A separate ability
     * would gate identical data under a different name.
     */
    public function exportData(Request $request, Customer $customer, CustomerDataExport $export): JsonResponse
    {
        $this->authorize('export', Customer::class);

        return response()
            ->json($export->for($customer, $request))
            ->withHeaders([
                'Content-Disposition' => 'attachment; filename="'.$export->filename($customer).'"',
                'X-Content-Type-Options' => 'nosniff',
            ]);
    }

    /**
     * Forget the person, keep the trade (ADR-026).
     *
     * Returns 200 and the resource rather than 204, unlike destroy(): the row
     * is still there and visibly different, so the screen should repaint with
     * what it became instead of guessing.
     */
    public function erase(Request $request, Customer $customer, EraseCustomer $erase): CustomerResource
    {
        $this->authorize('erase', $customer);

        $validated = $request->validate([
            /*
             * Why, in the operator's own words. It goes into the audit context
             * and nowhere else, and it is the only part of an erasure that
             * anyone can review afterwards — the data it acted on is gone.
             */
            'reason' => ['required', 'string', 'min:3', 'max:500'],
        ]);

        return CustomerResource::make($erase($customer, $validated['reason']));
    }

    /** A customer's own order history. */
    public function orders(Request $request, Customer $customer): AnonymousResourceCollection
    {
        $this->authorize('view', $customer);

        return OrderResource::collection(
            $customer->orders()
                ->with('customer')
                ->orderByDesc('placed_at')
                ->orderByDesc('created_at')
                ->paginate(QueryFilter::perPage($request)),
        );
    }

    /**
     * The validated input with the phone in E.164. Validation has already
     * refused a number that cannot be placed, so this cannot fail.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalized(array $data, ?Customer $customer = null): array
    {
        if (isset($data['phone']) && is_string($data['phone'])) {
            $country = $data['country'] ?? $customer?->country;
            $data['phone'] = PhoneNumber::normalize($data['phone'], is_string($country) ? $country : null);
        }

        return $data;
    }

    /**
     * @return array<string, mixed>
     */
    private function rules(Request $request, ?Customer $customer = null): array
    {
        return $request->validate([
            'name' => [$customer ? 'sometimes' : 'required', 'string', 'max:180'],
            'name_ar' => ['nullable', 'string', 'max:180'],
            // Unique among non-deleted rows, and nullable for walk-in trade.
            'email' => [
                'nullable', 'email', 'max:190',
                TenantRule::unique('customers', 'email')
                    ->whereNull('deleted_at')
                    ->ignore($customer?->id),
            ],
            /*
             * Stored in E.164 (ADR-021). A number without a country code takes
             * the customer's country's; one that cannot be placed is refused
             * rather than stored as typed.
             */
            'phone' => ['nullable', 'string', 'max:40', function (string $attribute, mixed $value, Closure $fail) use ($request, $customer): void {
                $country = $request->input('country', $customer?->country);

                if (is_string($value) && PhoneNumber::normalize($value, is_string($country) ? $country : null) === null) {
                    $fail(__('validation.phone'));
                }
            }],
            'company' => ['nullable', 'string', 'max:180'],
            // A business customer's VAT registration number, printed on its invoices.
            'vat_number' => ['nullable', 'string', 'max:32'],
            'address_line' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'country' => ['nullable', 'string', 'size:2'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }
}
