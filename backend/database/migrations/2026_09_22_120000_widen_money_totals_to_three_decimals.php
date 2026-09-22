<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Every money TOTAL goes from DECIMAL(15,2) to DECIMAL(15,3).
 *
 * Two places could not hold the business's own default currency: BHD — and
 * KWD, OMR and JOD — are denominated in thousandths, so every stored total lost
 * its third decimal. Three places hold any currency the settings accept
 * (currency_decimals is validated 0–3); what a given business's amounts are
 * actually rounded to is decided by App\Support\Money, from its currency.
 *
 * Widening is lossless: every existing two-place value is exactly
 * representable at three. Rows written before this keep the rounding they were
 * written with — an order's totals are a snapshot, and are not recomputed.
 *
 * Unit amounts (price, cost, unit_price, unit_cost) are already DECIMAL(15,4)
 * and are untouched.
 */
return new class extends Migration
{
    /** @var array<string, array<int, string>> */
    private const COLUMNS = [
        'orders' => [
            'refunded_amount',
            'subtotal_amount',
            'discount_amount',
            'tax_amount',
            'shipping_amount',
            'total_amount',
            'cogs_amount',
        ],
        'order_items' => ['line_discount', 'line_total'],
    ];

    public function up(): void
    {
        $this->resize(3);
    }

    public function down(): void
    {
        $this->resize(2);
    }

    private function resize(int $places): void
    {
        foreach (self::COLUMNS as $table => $columns) {
            Schema::table($table, function (Blueprint $blueprint) use ($columns, $places): void {
                foreach ($columns as $column) {
                    $blueprint->decimal($column, 15, $places)->default(0)->change();
                }
            });
        }

        // The one total with no default: an expense always states its amount.
        Schema::table('expenses', function (Blueprint $blueprint) use ($places): void {
            $blueprint->decimal('amount', 15, $places)->change();
        });
    }
};
