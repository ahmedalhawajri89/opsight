<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Export\CsvExport;
use App\Http\Controllers\Controller;
use App\Http\Resources\ExpenseResource;
use App\Models\Expense;
use App\Support\QueryFilter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExpenseController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Expense::class);

        return ExpenseResource::collection(
            $this->listing($request)
                ->paginate(QueryFilter::perPage($request))
                ->withQueryString(),
        );
    }

    public function export(Request $request, CsvExport $export): StreamedResponse
    {
        $this->authorize('export', Expense::class);

        return $export->stream(
            query: $this->listing($request),
            resource: ExpenseResource::class,
            columns: [
                'incurred_on' => 'Incurred on',
                'category.name' => 'Category',
                'description' => 'Description',
                'vendor' => 'Vendor',
                'reference' => 'Reference',
                'amount' => 'Amount',
                'notes' => 'Notes',
            ],
            request: $request,
            filename: 'expenses',
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
     * @return Builder<Expense>
     */
    private function listing(Request $request): Builder
    {
        $filter = new QueryFilter(
            filters: [
                'search' => QueryFilter::search(['description', 'vendor', 'reference']),
                'expense_category_id' => QueryFilter::exact('expense_category_id'),
                // Ranges on incurred_on, the business date — not created_at.
                'incurred_from' => QueryFilter::dateFrom('incurred_on'),
                'incurred_to' => QueryFilter::dateTo('incurred_on'),
            ],
            sortable: ['incurred_on', 'amount', 'description', 'created_at'],
            defaultSort: '-incurred_on',
        );

        /** @var Builder<Expense> $query */
        $query = $filter->apply(Expense::query()->with('category'), $request);

        return $query;
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Expense::class);

        $expense = new Expense($this->rules($request));
        $expense->created_by = $request->user()?->id;
        $expense->save();

        return ExpenseResource::make($expense->load('category'))->response()->setStatusCode(201);
    }

    public function show(Request $request, Expense $expense): ExpenseResource
    {
        $this->authorize('view', $expense);

        return ExpenseResource::make($expense->load('category'));
    }

    public function update(Request $request, Expense $expense): ExpenseResource
    {
        $this->authorize('update', $expense);

        $expense->update($this->rules($request, $expense));

        return ExpenseResource::make($expense->fresh()->load('category'));
    }

    public function destroy(Request $request, Expense $expense): JsonResponse
    {
        $this->authorize('delete', $expense);

        $expense->delete();

        return response()->json(null, 204);
    }

    /** @return array<string, mixed> */
    private function rules(Request $request, ?Expense $expense = null): array
    {
        $required = $expense ? 'sometimes' : 'required';

        return $request->validate([
            'expense_category_id' => [
                $required, 'integer',
                Rule::exists('expense_categories', 'id')->whereNull('deleted_at'),
            ],
            'description' => [$required, 'string', 'max:255'],
            'amount' => [$required, 'numeric', 'min:0.01'],
            /*
             * Backdating is explicitly allowed — an invoice dated last month is
             * last month's expense, and forbidding it would make the figures
             * wrong to keep the form tidy (METRICS.md §2.9).
             */
            'incurred_on' => [$required, 'date'],
            'vendor' => ['nullable', 'string', 'max:180'],
            'reference' => ['nullable', 'string', 'max:80'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }
}
