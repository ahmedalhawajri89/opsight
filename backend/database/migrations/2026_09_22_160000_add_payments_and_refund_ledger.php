<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Payments, and a refund ledger (ADR-022).
 *
 * `order_payments` records money received, one row per payment: split
 * tender, and cash on delivery collected days after the goods left, both need
 * more than one. `order_refunds` replaces the single overwritable refund of
 * ADR-005 with one row per refund.
 *
 * The order keeps running totals — amount_paid, refunded_amount,
 * refunded_vat_amount — written in the same transaction as each ledger row,
 * so every existing metric, which reads the order, keeps working unchanged. A
 * test holds each total to the sum of its ledger.
 *
 * BACKFILL. Orders fulfilled or refunded before payments were recorded are
 * treated as having been paid: one payment for what the customer finally
 * owed, method "other", marked as recorded before payment tracking. Without it
 * every historical sale would read as unpaid and receivables would be
 * inflated by money that was, in fact, collected. Existing refunds become the
 * first row of the new ledger, and those orders are taken to have had their
 * stock returned, so a later refund cannot return it twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->decimal('amount', 15, 3);
            // cash, card, bank_transfer, cash_on_delivery, wallet, other (PaymentMethod).
            $table->string('method', 24);
            $table->timestamp('paid_at');
            $table->string('reference', 80)->nullable();
            $table->boolean('is_backfill')->default(false);
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['order_id', 'paid_at']);
        });

        Schema::create('order_refunds', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            // The revenue returned (excluding VAT), the VAT returned, and their sum.
            $table->decimal('amount', 15, 3);
            $table->decimal('vat_amount', 15, 3)->default(0);
            $table->decimal('total', 15, 3);
            $table->boolean('returned_stock')->default(false);
            $table->string('reason', 255)->nullable();
            $table->timestamp('refunded_at');
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['order_id', 'refunded_at']);
        });

        Schema::table('orders', function (Blueprint $table): void {
            $table->decimal('amount_paid', 15, 3)->default(0)->after('total_amount');
            // Stock goes back once per order, however many refunds follow.
            $table->timestamp('stock_returned_at')->nullable()->after('refunded_at');
        });

        DB::statement('ALTER TABLE order_payments ADD CONSTRAINT chk_order_payments_amount CHECK (amount > 0)');
        DB::statement('ALTER TABLE order_refunds ADD CONSTRAINT chk_order_refunds_amount CHECK (total > 0 AND amount >= 0 AND vat_amount >= 0)');
        DB::statement('ALTER TABLE orders ADD CONSTRAINT chk_orders_amount_paid CHECK (amount_paid >= 0)');

        $this->backfill();
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE orders DROP CONSTRAINT chk_orders_amount_paid');

        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn(['amount_paid', 'stock_returned_at']));
        Schema::dropIfExists('order_refunds');
        Schema::dropIfExists('order_payments');
    }

    private function backfill(): void
    {
        $now = now();

        // Existing refunds become the first ledger row, stock taken as returned.
        DB::table('orders')
            ->where('status', 'refunded')
            ->orderBy('id')
            ->each(function (object $order) use ($now): void {
                $amount = (string) $order->refunded_amount;
                $vat = (string) $order->refunded_vat_amount;
                $total = bcadd($amount, $vat, 3);

                if (bccomp($total, '0', 3) > 0) {
                    DB::table('order_refunds')->insert([
                        'order_id' => $order->id,
                        'amount' => $amount,
                        'vat_amount' => $vat,
                        'total' => $total,
                        'returned_stock' => true,
                        'reason' => null,
                        'refunded_at' => $order->refunded_at ?? $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                DB::table('orders')->where('id', $order->id)->update(['stock_returned_at' => $order->refunded_at ?? $now]);
            });

        // Sales completed before payment tracking are taken as paid in full.
        DB::table('orders')
            ->whereIn('status', ['fulfilled', 'refunded'])
            ->orderBy('id')
            ->each(function (object $order) use ($now): void {
                $owed = bcsub(
                    (string) $order->total_amount,
                    bcadd((string) $order->refunded_amount, (string) $order->refunded_vat_amount, 3),
                    3,
                );

                // What was paid is what was finally owed, plus anything later refunded.
                $paid = bcadd($owed, bcadd((string) $order->refunded_amount, (string) $order->refunded_vat_amount, 3), 3);

                if (bccomp($paid, '0', 3) <= 0) {
                    return;
                }

                DB::table('order_payments')->insert([
                    'order_id' => $order->id,
                    'amount' => $paid,
                    'method' => 'other',
                    'paid_at' => $order->fulfilled_at ?? $order->placed_at ?? $now,
                    'reference' => null,
                    'is_backfill' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                DB::table('orders')->where('id', $order->id)->update(['amount_paid' => $paid]);
            });
    }
};
