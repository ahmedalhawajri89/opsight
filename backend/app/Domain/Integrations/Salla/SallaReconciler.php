<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use App\Domain\Metrics\Period;
use App\Domain\Orders\OrderStatus;
use App\Models\Integration;
use App\Support\Money;
use App\Support\Tenancy\TenantQuery;
use RuntimeException;

/**
 * Asking Salla what it thinks a period was worth, and comparing.
 *
 * THE POINT IS TO CATCH A SILENT IMPORTER. An importer that drops one order
 * in fifty does not fail; it produces figures that are plausible, slightly
 * low, and wrong — and nothing in the application would ever say so. This is
 * the only thing that would.
 *
 * So the one behaviour it must never have is a false all-clear. Every shape
 * it does not recognise is an error, not a zero: a reconciliation that
 * reports no differences because it parsed nothing is worse than none at
 * all, because somebody acts on it.
 *
 * Counts and money, nothing else. Comparing line items or customers would
 * mean re-deriving Salla's own arithmetic, and a disagreement would more
 * often be our reading of their rounding than a missing record.
 */
final class SallaReconciler
{
    public function __construct(private readonly SallaClient $client) {}

    /**
     * @return array{
     *     ours: array{orders: int, revenue: string},
     *     theirs: array{orders: int, revenue: string},
     *     differences: list<array{what: string, ours: string, theirs: string}>
     * }
     */
    public function __invoke(Integration $integration, Period $period): array
    {
        $ours = $this->ours($period);
        $theirs = $this->theirs($integration, $period);

        $differences = [];

        if ($ours['orders'] !== $theirs['orders']) {
            $differences[] = [
                'what' => 'orders',
                'ours' => (string) $ours['orders'],
                'theirs' => (string) $theirs['orders'],
            ];
        }

        // Compared as decimal strings, never as floats: the whole money layer
        // of this system exists because 0.1 + 0.2 is not 0.3 (ADR-015).
        if (bccomp($ours['revenue'], $theirs['revenue'], Money::scale()) !== 0) {
            $differences[] = [
                'what' => 'revenue',
                'ours' => $ours['revenue'],
                'theirs' => $theirs['revenue'],
            ];
        }

        return ['ours' => $ours, 'theirs' => $theirs, 'differences' => $differences];
    }

    /**
     * What this installation holds for the period.
     *
     * Only orders that came FROM this store: a business that also records
     * walk-in sales by hand would otherwise see every one of them reported
     * as a difference, and learn to ignore the output.
     *
     * @return array{orders: int, revenue: string}
     */
    private function ours(Period $period): array
    {
        $rows = TenantQuery::table('orders')
            ->where('source', 'salla')
            ->whereIn('status', OrderStatus::qualifying())
            ->where('placed_at', '>=', $period->fromUtc)
            ->where('placed_at', '<', $period->toExclusiveUtc)
            ->selectRaw('COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue')
            ->first();

        return [
            'orders' => (int) ($rows->orders ?? 0),
            'revenue' => Money::round((string) ($rows->revenue ?? '0')),
        ];
    }

    /**
     * What Salla holds for the same period.
     *
     * @return array{orders: int, revenue: string}
     */
    private function theirs(Integration $integration, Period $period): array
    {
        $orders = 0;
        $revenue = '0';

        foreach ($this->client->each($integration, 'orders', [
            'from_date' => $period->from,
            'to_date' => $period->to,
        ]) as $order) {
            $orders++;
            $revenue = bcadd($revenue, $this->totalOf($order), Money::scale());
        }

        return ['orders' => $orders, 'revenue' => Money::round($revenue)];
    }

    /**
     * One order's total, as a decimal string.
     *
     * Salla nests money as `{amount, currency}` under `amounts.total`. An
     * order whose total cannot be read is an ERROR rather than a zero: a
     * zero would quietly make our figures look too high by exactly the
     * amount nobody noticed.
     *
     * @param  array<string, mixed>  $order
     */
    private function totalOf(array $order): string
    {
        $amount = $order['amounts']['total']['amount'] ?? null;

        if (! is_numeric($amount)) {
            $id = $order['id'] ?? 'unknown';

            throw new RuntimeException("Salla order {$id} had no readable total; the API shape has changed.");
        }

        return (string) $amount;
    }
}
