<?php

declare(strict_types=1);

namespace App\Domain\Tax;

use App\Domain\Metrics\Period;
use App\Domain\Orders\OrderStatus;
use App\Models\BusinessSetting;
use App\Support\Money;
use App\Support\Tenancy\TenantQuery;

/**
 * VAT for a period: what was charged, what was handed back, what is due.
 *
 * An OPERATIONAL figure — "how much of what we took belongs to the tax
 * authority" — not a filed return. Output VAT only: input VAT on purchases is
 * not recorded anywhere in Opsight, so this is the gross liability before any
 * reclaim, and says so (ADR-018).
 *
 * Read from the per-line snapshots taken at confirm, never recomputed from a
 * rate: a rate change next month cannot restate this month. Orders confirmed
 * before VAT was switched on carry no snapshot and contribute nothing — a
 * typed-in tax figure on such an order was never a rate-backed VAT amount.
 *
 * Same population and dating as revenue (METRICS.md §1.3): confirmed,
 * fulfilled and refunded orders, by the date they were placed, with refunded
 * VAT counted against the period of the sale.
 */
final class VatReport
{
    /**
     * @return array{
     *     enabled: bool,
     *     rate: string,
     *     prices_include_vat: bool,
     *     output_vat: string,
     *     refunded_vat: string,
     *     vat_due: string,
     *     by_rate: list<array{rate: string, taxable: string, vat: string}>,
     * }
     */
    public function for(Period $period): array
    {
        $settings = BusinessSetting::current();
        $scale = Money::scale();
        [$from, $to] = $period->utcBounds();

        $byRate = TenantQuery::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', OrderStatus::qualifying())
            ->where('orders.placed_at', '>=', $from)
            ->where('orders.placed_at', '<', $to)
            // A line with no taxable amount was confirmed before VAT existed.
            ->where('order_items.vat_taxable_amount', '<>', 0)
            ->groupBy('order_items.vat_rate')
            ->orderByDesc('order_items.vat_rate')
            ->selectRaw('order_items.vat_rate AS rate, SUM(order_items.vat_taxable_amount) AS taxable, SUM(order_items.vat_amount) AS vat')
            ->get()
            ->map(fn (object $row): array => [
                'rate' => (string) $row->rate,
                'taxable' => Money::round((string) $row->taxable),
                'vat' => Money::round((string) $row->vat),
            ])
            ->values()
            ->all();

        $output = array_reduce($byRate, fn (string $sum, array $row): string => bcadd($sum, $row['vat'], $scale), Money::zero());

        $refunded = Money::round((string) (TenantQuery::table('orders')
            ->whereIn('status', OrderStatus::qualifying())
            ->where('placed_at', '>=', $from)
            ->where('placed_at', '<', $to)
            ->sum('refunded_vat_amount')));

        return [
            'enabled' => (bool) $settings->vat_enabled,
            'rate' => (string) $settings->vat_rate,
            'prices_include_vat' => (bool) $settings->prices_include_vat,
            'output_vat' => $output,
            'refunded_vat' => $refunded,
            'vat_due' => bcsub($output, $refunded, $scale),
            'by_rate' => $byRate,
        ];
    }
}
