<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The revenue-bearing record.
 *
 * ON THE STORED TOTALS. `subtotal_amount`, `total_amount` and `cogs_amount` are
 * computed values that ARE stored, which looks like it contradicts "never store
 * derived values". The distinction is deliberate: these are FROZEN
 * TRANSACTIONAL FACTS, not metrics. Once an order is confirmed they can never
 * legitimately change — they are what the customer was charged — and
 * re-deriving the same immutable number on every read would be waste.
 *
 * Metrics like Net Revenue and Gross Margin remain uncomputed and unstored.
 * A test asserts the stored totals equal the sum of their lines
 * (DATABASE_DESIGN.md §3.6).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table): void {
            $table->id();

            // The human identifier, e.g. ORD-2026-000418.
            $table->string('reference', 32)->unique();

            // RESTRICT: a customer with orders can never be hard-deleted.
            $table->foreignId('customer_id')->nullable()
                ->constrained('customers')->restrictOnDelete();

            $table->enum('status', ['draft', 'confirmed', 'fulfilled', 'cancelled', 'refunded'])
                ->default('draft');

            // THE business date for every order metric. Set at confirm.
            // `created_at` is never used by a metric: a draft written in July
            // and confirmed in August is August revenue.
            $table->timestamp('placed_at')->nullable();
            $table->timestamp('fulfilled_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancellation_reason', 255)->nullable();
            $table->timestamp('refunded_at')->nullable();
            $table->decimal('refunded_amount', 15, 2)->default(0);

            // Totals rounded at the LINE, then summed — what an invoice does.
            $table->decimal('subtotal_amount', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);

            // Neither of these is revenue (ADR-013). Stored so the definition
            // can change without data loss.
            $table->decimal('tax_amount', 15, 2)->default(0);
            $table->decimal('shipping_amount', 15, 2)->default(0);

            $table->decimal('total_amount', 15, 2)->default(0);

            // Restricted field: frozen at confirm from the line cost snapshots.
            $table->decimal('cogs_amount', 15, 2)->default(0);

            $table->text('notes')->nullable();

            $table->foreignId('created_by')->nullable()
                ->constrained('users')->nullOnDelete();

            $table->timestamps();

            // The workhorse index. Column order matters: status is an equality
            // (or small IN) predicate and must come first for the range on
            // placed_at to be usable (DATABASE_DESIGN.md §6).
            $table->index(['status', 'placed_at']);
            $table->index('placed_at');
            $table->index(['customer_id', 'placed_at']);
            $table->index('created_by');
            $table->index(['status', 'created_at']);
        });

        DB::statement('ALTER TABLE orders ADD CONSTRAINT chk_orders_refunded_non_negative CHECK (refunded_amount >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
