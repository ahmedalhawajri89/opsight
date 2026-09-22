<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

use App\Authorization\Ability;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentStatus;
use App\Models\User;
use App\Support\Money;
use App\Support\Tenancy\TenantQuery;

/**
 * The dashboard's "quick stats": the size of the business right now.
 *
 * Counts, not flows — so each is POINT IN TIME, measured at the end of the
 * selected period, and its change is how that count moved across the period
 * (from the count standing at its first moment). That is the only change a
 * count honestly has: "products grew 12% over the last 30 days" is true,
 * whereas comparing against the previous period would compare two stocks
 * measured at two arbitrary instants.
 *
 * Soft-deleted rows are counted for the instants they existed in, so deleting
 * a product today does not rewrite how many there were a month ago.
 *
 * What a role may not see is absent rather than null: inventory value is cost
 * (metrics.view_cost), the number of user accounts is administration
 * (users.view), and receivables are a financial position (analytics.view).
 */
final class QuickStats
{
    /**
     * @return array<string, array{value: int|string, change: float|null}>
     */
    public function for(Period $period, ?User $user): array
    {
        [$from, $toExclusive] = $period->utcBounds();

        $stats = [
            'products' => $this->growth('products', $from, $toExclusive),
            'customers' => $this->growth('customers', $from, $toExclusive),
        ];

        if ($user?->can(Ability::MetricsViewCost->value) ?? false) {
            $stats['inventory_value'] = [
                // Today's stock at catalogue cost. There is no history of
                // valuation (ADR-014), so there is no honest change to report.
                'value' => (string) (TenantQuery::table('inventory_items')
                    ->join('products', 'products.id', '=', 'inventory_items.product_id')
                    ->whereNull('products.deleted_at')
                    ->selectRaw('COALESCE(SUM(ROUND(inventory_items.stock_on_hand * products.cost, '.Money::scale().')), 0) AS total')
                    ->value('total') ?? Money::zero()),
                'change' => null,
            ];
        }

        if ($user?->can(Ability::AnalyticsView->value) ?? false) {
            $stats['receivables'] = [
                // Owed today by committed orders, on PaymentStatus's formula
                // (ADR-022). Like inventory value, a position with no history.
                'value' => Money::round((string) (TenantQuery::table('orders')
                    ->whereIn('status', OrderStatus::qualifying())
                    ->selectRaw('COALESCE(SUM('.PaymentStatus::outstandingSql().'), 0) AS total')
                    ->value('total') ?? Money::zero())),
                'change' => null,
            ];
        }

        if ($user?->can(Ability::UsersView->value) ?? false) {
            $stats['active_users'] = [
                'value' => (int) TenantQuery::table('users')->where('is_active', true)->count(),
                'change' => null,
            ];
        }

        return $stats;
    }

    /**
     * A count at the end of the period, and its change since the period began.
     *
     * @return array{value: int, change: float|null}
     */
    private function growth(string $table, string $from, string $toExclusive): array
    {
        $end = $this->countAt($table, $toExclusive);
        $start = $this->countAt($table, $from);

        return [
            'value' => $end,
            // Growth from nothing is not a percentage.
            'change' => $start > 0 ? round(($end - $start) / $start, 6) : null,
        ];
    }

    /** Rows that existed at an instant: created before it, not yet deleted. */
    private function countAt(string $table, string $instant): int
    {
        return (int) TenantQuery::table($table)
            ->where('created_at', '<', $instant)
            ->where(fn ($query) => $query->whereNull('deleted_at')->orWhere('deleted_at', '>=', $instant))
            ->count();
    }
}
