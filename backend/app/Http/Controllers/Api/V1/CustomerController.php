<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\OrderResource;
use App\Models\Customer;
use App\Support\QueryFilter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class CustomerController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Customer::class);

        $filter = new QueryFilter(
            filters: [
                'search' => QueryFilter::search(['name', 'email', 'company', 'phone']),
                'is_active' => QueryFilter::boolean('is_active'),
                'country' => QueryFilter::exact('country'),
            ],
            sortable: ['name', 'email', 'created_at'],
            defaultSort: 'name',
        );

        return CustomerResource::collection(
            $filter->apply(Customer::query(), $request)
                ->paginate(QueryFilter::perPage($request))
                ->withQueryString(),
        );
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Customer::class);

        $customer = new Customer($this->rules($request));
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

        $customer->update($this->rules($request, $customer));

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
     * @return array<string, mixed>
     */
    private function rules(Request $request, ?Customer $customer = null): array
    {
        return $request->validate([
            'name' => [$customer ? 'sometimes' : 'required', 'string', 'max:180'],
            // Unique among non-deleted rows, and nullable for walk-in trade.
            'email' => [
                'nullable', 'email', 'max:190',
                Rule::unique('customers', 'email')
                    ->whereNull('deleted_at')
                    ->ignore($customer?->id),
            ],
            'phone' => ['nullable', 'string', 'max:40'],
            'company' => ['nullable', 'string', 'max:180'],
            'address_line' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'country' => ['nullable', 'string', 'size:2'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }
}
