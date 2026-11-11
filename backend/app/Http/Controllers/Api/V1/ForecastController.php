<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Forecast\StockForecast;
use App\Http\Controllers\Controller;
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
}
