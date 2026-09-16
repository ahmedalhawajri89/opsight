<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Current stock state. One row per product.
 *
 * `stock_on_hand` is a DERIVED CACHE, not the source of truth — the ledger in
 * `inventory_movements` is. It exists because summing the ledger on every list
 * page would be expensive, and it is maintained inside the same transaction as
 * the movement that changed it, under a row lock.
 *
 * Invariant, asserted by test and by a reconciliation command:
 *   stock_on_hand == SUM(inventory_movements.quantity_delta)
 *
 * Kept in its own table rather than as columns on `products` for three reasons:
 * it isolates derived state from catalog source data, it gives the confirm
 * transaction a narrow row to lock without contending on the product record,
 * and dropping the unique constraint plus adding `location_id` is the whole
 * multi-warehouse migration (ADR-006).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_items', function (Blueprint $table): void {
            $table->id();

            // UNIQUE is what makes the row-lock strategy correct: there is
            // exactly one row to lock per product.
            $table->foreignId('product_id')->unique()
                ->constrained('products')->cascadeOnDelete();

            // Signed, so the CHECK below is meaningful rather than decorative.
            $table->integer('stock_on_hand')->default(0);

            // Reserved for a future draft-hold feature; always 0 in the MVP, so
            // ADR-007's option 2 can be added without a migration.
            $table->integer('reserved_quantity')->default(0);

            $table->unsignedInteger('reorder_point')->default(0);
            $table->timestamp('last_movement_at')->nullable();

            $table->timestamps();

            $table->index('stock_on_hand');
        });

        DB::statement('ALTER TABLE inventory_items ADD CONSTRAINT chk_inventory_stock_non_negative CHECK (stock_on_hand >= 0)');
        DB::statement('ALTER TABLE inventory_items ADD CONSTRAINT chk_inventory_reserved_non_negative CHECK (reserved_quantity >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_items');
    }
};
