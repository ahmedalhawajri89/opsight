<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The catalog.
 *
 * `price` and `cost` are the CURRENT values only. No metric ever reads them —
 * metrics read the snapshot on `order_items`. This is the single most important
 * separation in the schema: it is what makes a price change today unable to
 * rewrite last quarter's margin (MVP_SCOPE.md §5).
 *
 * `cost` is a restricted field: roles without `products.view_cost` never
 * receive it, and the key is omitted from the response rather than nulled.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table): void {
            $table->id();

            // Immutable after creation — enforced in the domain, unique here.
            $table->string('sku', 64)->unique();
            $table->string('name', 180);
            $table->text('description')->nullable();

            $table->foreignId('category_id')->nullable()
                ->constrained('categories')->nullOnDelete();

            // Four decimal places: unit costs genuinely land below one cent.
            $table->decimal('price', 15, 4);
            $table->decimal('cost', 15, 4)->default(0);

            $table->string('unit', 24)->default('piece');
            $table->unsignedInteger('low_stock_threshold')->nullable();
            $table->boolean('is_active')->default(true);

            $table->foreignId('created_by')->nullable()
                ->constrained('users')->nullOnDelete();

            $table->softDeletes();
            $table->timestamps();

            $table->index(['category_id', 'is_active']);
            $table->index('is_active');
            $table->index('name');
        });

        DB::statement('ALTER TABLE products ADD CONSTRAINT chk_products_price_non_negative CHECK (price >= 0)');
        DB::statement('ALTER TABLE products ADD CONSTRAINT chk_products_cost_non_negative CHECK (cost >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
