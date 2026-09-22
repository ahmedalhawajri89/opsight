<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Http\Controllers\Controller;
use App\Models\BusinessSetting;
use App\Models\ExpenseCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Business settings — configuration an Owner edits at runtime.
 *
 * These live in the database rather than in `.env` because they are business
 * facts, not deployment facts: the currency and the fiscal year are decided by
 * the company, not by the server it happens to run on, and changing one should
 * not require a deploy.
 *
 * TWO OF THEM MOVE HISTORY. `timezone` and `fiscal_year_start_month` are
 * inputs to every period boundary in the system, so changing either one
 * changes what every past metric reports — not the underlying records, which
 * are immutable, but which period they fall into. The response flags both so
 * the UI can say so before the change rather than after (METRICS.md §1.2).
 */
class SettingsController extends Controller
{
    /**
     * Owner-only, like every other route in this controller.
     *
     * The tempting alternative is to open the read to everyone on the grounds
     * that currency and timezone are formatting inputs rather than secrets.
     * That argument does not survive contact with the code: the screens that
     * format money already receive `currency` and `currency_decimals` in the
     * META of the analytics responses they were going to make anyway. Nothing
     * outside this screen needs this endpoint.
     *
     * So the read stays behind `settings.view`, which is the ability the
     * registry defines for exactly this, and the default is denial
     * (SECURITY.md §2.1, §2.4). If a future screen genuinely needs the
     * currency for a role without that ability, the fix is to put it in that
     * endpoint's meta — not to widen this one.
     */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user === null || ! $user->can(Ability::SettingsView->value)) {
            abort(403);
        }

        $settings = BusinessSetting::current();

        return response()->json([
            'data' => [
                'company_name' => $settings->company_name,
                'currency' => $settings->currency,
                'currency_decimals' => $settings->currency_decimals,
                'timezone' => $settings->timezone,
                'fiscal_year_start_month' => $settings->fiscal_year_start_month,
                'default_low_stock_threshold' => $settings->default_low_stock_threshold,
                // Value-added tax (ADR-018).
                'vat_enabled' => (bool) $settings->vat_enabled,
                'vat_rate' => (string) $settings->vat_rate,
                'prices_include_vat' => (bool) $settings->prices_include_vat,
                'vat_number' => $settings->vat_number,
                'commercial_registration' => $settings->commercial_registration,
                // The business week (ADR-020), ISO days: 1 = Monday … 7 = Sunday.
                'week_starts_on' => (int) $settings->week_starts_on,
                'weekend_days' => $settings->weekend_days ?? [],
            ],
            'meta' => [
                // Non-null: the guard above returned already if it were not.
                'editable' => $user->can(Ability::SettingsUpdate->value),
                /*
                 * Named explicitly rather than left for the UI to hardcode, so
                 * a field that becomes history-affecting later is warned about
                 * by changing one list on the server.
                 */
                'affects_history' => ['timezone', 'fiscal_year_start_month', 'week_starts_on'],
                /*
                 * VAT settings apply to orders confirmed AFTER the change; every
                 * confirmed order keeps the VAT it was snapshotted with. Named so
                 * the screen can say that, rather than implying a restatement.
                 */
                'applies_from_now' => ['vat_enabled', 'vat_rate', 'prices_include_vat'],
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user === null || ! $user->can(Ability::SettingsUpdate->value)) {
            abort(403);
        }

        $validated = $request->validate([
            'company_name' => ['sometimes', 'string', 'max:160'],
            // ISO 4217. Not a free-text field: the currency drives formatting
            // everywhere, and a typo would silently relabel every figure.
            'currency' => ['sometimes', 'string', 'size:3', 'alpha'],
            // Two or three. Bahraini dinar is three; most currencies are two.
            'currency_decimals' => ['sometimes', 'integer', 'between:0,3'],
            'timezone' => ['sometimes', 'string', 'max:64', Rule::in(timezone_identifiers_list())],
            'fiscal_year_start_month' => ['sometimes', 'integer', 'between:1,12'],
            'default_low_stock_threshold' => ['sometimes', 'integer', 'min:0'],
            // Value-added tax (ADR-018). The rate is a percentage: 10 for
            // Bahrain, 15 for Saudi Arabia, 5 for the UAE.
            'vat_enabled' => ['sometimes', 'boolean'],
            'vat_rate' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'prices_include_vat' => ['sometimes', 'boolean'],
            'vat_number' => ['sometimes', 'nullable', 'string', 'max:32'],
            'commercial_registration' => ['sometimes', 'nullable', 'string', 'max:32'],
            // ISO days, 1 = Monday … 7 = Sunday. At least one working day must remain.
            'week_starts_on' => ['sometimes', 'integer', 'between:1,7'],
            'weekend_days' => ['sometimes', 'array', 'max:6'],
            'weekend_days.*' => ['integer', 'between:1,7', 'distinct'],
        ]);

        $settings = BusinessSetting::current();

        // Stored as sorted integers, whatever form they arrived in, so a
        // strict comparison anywhere downstream cannot miss "5" against 5.
        if (array_key_exists('weekend_days', $validated)) {
            $days = array_map('intval', $validated['weekend_days']);
            sort($days);
            $validated['weekend_days'] = array_values(array_unique($days));
        }

        $settings->fill($validated);
        $settings->save();

        /*
         * The per-process memo of the singleton is cleared by the model's own
         * `saved` hook, so the rest of THIS request already computes periods
         * in the new timezone. Repeating the flush here would suggest the
         * model does not handle it.
         */
        return $this->show($request);
    }

    /**
     * Expense categories, for the expense form and its filter.
     *
     * Read-only in the MVP: the eight seeded categories are a deliberate fixed
     * vocabulary. A free-text or user-extensible list makes the expense
     * breakdown unreliable the first time somebody types "Utilties", and the
     * breakdown is the only reason the table exists (DATABASE_DESIGN.md §1).
     *
     * @return array{data: array<int, array<string, mixed>>}
     */
    public function expenseCategories(Request $request): array
    {
        $user = $request->user();

        if ($user === null || ! $user->can(Ability::ExpensesView->value)) {
            abort(403);
        }

        return [
            'data' => ExpenseCategory::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get()
                ->map(static fn (ExpenseCategory $category): array => [
                    'id' => $category->id,
                    'name' => $category->name,
                    'slug' => $category->slug,
                ])
                ->all(),
        ];
    }
}
