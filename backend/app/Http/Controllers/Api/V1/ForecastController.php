<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Audit\AuditRecorder;
use App\Domain\Forecast\CashForecast;
use App\Domain\Forecast\StockForecast;
use App\Http\Controllers\Controller;
use App\Models\BusinessSetting;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Forecasts (product track, phase D).
 *
 * Stock: open to whoever may see the inventory. The cost of a suggested
 * order is included only for a role that may see cost, like every other
 * cost figure in the system.
 */
class ForecastController extends Controller
{
    public function stock(Request $request, StockForecast $forecast): JsonResponse
    {
        $user = $request->user();

        if (! ($user?->can(Ability::InventoryView->value) ?? false)) {
            abort(403);
        }

        $input = $request->validate([
            // Days from ordering to the stock arriving.
            'lead_time' => ['sometimes', 'integer', 'min:0', 'max:120'],
            // Days of selling the order should cover once it arrives.
            'cover_days' => ['sometimes', 'integer', 'min:1', 'max:180'],
        ]);

        return response()->json(['data' => $forecast->for(
            leadTime: (int) ($input['lead_time'] ?? 7),
            coverDays: (int) ($input['cover_days'] ?? 30),
            withCost: $user->can(Ability::MetricsViewCost->value),
        )]);
    }

    /**
     * Thirteen weeks of cash. A financial position built on costs, so it is
     * for a role that may see cost.
     */
    public function cash(Request $request, CashForecast $forecast): JsonResponse
    {
        if (! ($request->user()?->can(Ability::MetricsViewCost->value) ?? false)) {
            abort(403);
        }

        return response()->json(['data' => $forecast->for()]);
    }

    /**
     * The cash in hand, stated by someone who may change the business's
     * settings. Audited: the whole forecast's level moves with it.
     */
    public function setBalance(Request $request, AuditRecorder $recorder): JsonResponse
    {
        if (! ($request->user()?->can(Ability::SettingsUpdate->value) ?? false)) {
            abort(403);
        }

        $input = $request->validate([
            /*
             * Written out, not `numeric`: `numeric` lets "1e5", " 5" and a JSON
             * float sent as 1.0E-7 through to the money arithmetic, which
             * cannot read them and answered with a 500. Twelve whole digits
             * and three places is exactly what the column holds.
             */
            'amount' => ['present', 'nullable', 'regex:/^-?\d{1,12}(\.\d{1,3})?$/'],
            'as_of' => ['nullable', 'date', 'before_or_equal:today'],
        ]);

        $settings = BusinessSetting::current();
        $before = $settings->cash_balance;

        $settings->forceFill([
            'cash_balance' => $input['amount'] === null ? null : Money::round((string) $input['amount']),
            'cash_balance_as_of' => $input['amount'] === null ? null : ($input['as_of'] ?? now()->toDateString()),
        ])->save();

        $recorder->record(
            action: 'forecast.cash_balance_set',
            subject: $settings,
            context: ['from' => $before, 'to' => $settings->cash_balance],
        );

        return response()->json(['data' => [
            'cash_balance' => $settings->cash_balance,
            'cash_balance_as_of' => $settings->cash_balance_as_of?->toDateString(),
        ]]);
    }
}
