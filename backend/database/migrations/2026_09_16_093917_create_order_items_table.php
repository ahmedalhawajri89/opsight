<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Order lines — where historical truth is preserved.
 *
 * The four snapshot columns are the reason a price change today cannot rewrite
 * last quarter's margin. This table joins to `products` for NAVIGATION ONLY,
 * never for money (MVP_SCOPE.md §5).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_items', function (Blueprint $table): void {
            $table->id();

            // CASCADE is safe ONLY because orders are never deleted once they
            // leave draft. Deleting a draft correctly removes its lines.
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();

            // RESTRICT: a sold product can never be hard-deleted.
            $table->foreignId('product_id')->nullable()
                ->constrained('products')->restrictOnDelete();

            // ---- Snapshots, taken at confirm ------------------------------
            $table->string('product_name', 180);
            $table->string('product_sku', 64);
            $table->decimal('unit_price', 15, 4);
            $table->decimal('unit_cost', 15, 4)->default(0); // restricted field
            // ---------------------------------------------------------------

            $table->unsignedInteger('quantity');
            $table->decimal('line_discount', 15, 2)->default(0);

            // ROUND(unit_price * quantity, 2) - line_discount
            $table->decimal('line_total', 15, 2)->default(0);

            $table->timestamps();

            $table->index('order_id');
            $table->index('product_id');
            // Keeps product-level analytics index-driven.
            $table->index(['product_id', 'order_id']);
        });

        DB::statement('ALTER TABLE order_items ADD CONSTRAINT chk_order_items_quantity_positive CHECK (quantity >= 1)');
        DB::statement('ALTER TABLE order_items ADD CONSTRAINT chk_order_items_price_non_negative CHECK (unit_price >= 0)');
        DB::statement('ALTER TABLE order_items ADD CONSTRAINT chk_order_items_cost_non_negative CHECK (unit_cost >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
