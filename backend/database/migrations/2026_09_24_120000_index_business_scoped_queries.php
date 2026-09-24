<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Indexes that start where every query now starts: the business (ADR-023).
 *
 * The tenancy retrofit put `business_id` in front of every predicate but left
 * the indexes as they were designed without it, so MySQL had a choice between
 * ranging on a date ACROSS every business and post-filtering, or reading one
 * business's whole history and filtering the dates in memory. Measured on the
 * development database before this migration: the dashboard's receivables
 * panel and the default order listing were both full table scans, and the
 * listing added a filesort.
 *
 * The one table the tenancy migration did index this way — activity_logs —
 * was already resolving the same shape as an index range with no sort, which
 * is what made the gap obvious.
 *
 * The old single-column and status-first indexes are dropped where a
 * tenant-prefixed one now covers them. Indexes that a foreign key needs
 * (`customer_id`, `product_id`, `expense_category_id`, `created_by`) stay, and
 * so does anything a different access path still uses.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            // The workhorse: qualifying statuses, ranged on the business date.
            $table->index(['business_id', 'status', 'placed_at'], 'orders_business_status_placed_index');
            // The default listing, newest first. Without `status` between them
            // the sort is the index's own order, so there is no filesort.
            $table->index(['business_id', 'created_at'], 'orders_business_created_index');
            // The same listing filtered by status, and drafts, which have no
            // placed_at to range on.
            $table->index(['business_id', 'status', 'created_at'], 'orders_business_status_created_index');
            // Receivables and every "what does this business owe us" sweep.
            $table->index(['business_id', 'customer_id', 'placed_at'], 'orders_business_customer_placed_index');

            $table->dropIndex('orders_status_placed_at_index');
            $table->dropIndex('orders_status_created_at_index');
            $table->dropIndex('orders_placed_at_index');
        });

        Schema::table('order_items', function (Blueprint $table): void {
            // Every metric reads the lines of a business, joined back to orders.
            $table->index(['business_id', 'order_id'], 'order_items_business_order_index');
        });

        Schema::table('expenses', function (Blueprint $table): void {
            $table->index(['business_id', 'incurred_on'], 'expenses_business_incurred_index');
            $table->dropIndex('expenses_incurred_on_index');
        });

        Schema::table('products', function (Blueprint $table): void {
            $table->index(['business_id', 'is_active'], 'products_business_active_index');
        });

        Schema::table('customers', function (Blueprint $table): void {
            $table->index(['business_id', 'created_at'], 'customers_business_created_index');
            $table->index(['business_id', 'is_active'], 'customers_business_active_index');

            $table->dropIndex('customers_created_at_index');
            $table->dropIndex('customers_is_active_index');
        });

        Schema::table('inventory_items', function (Blueprint $table): void {
            // The low-stock sweep, per business.
            $table->index(['business_id', 'stock_on_hand'], 'inventory_business_stock_index');
            $table->dropIndex('inventory_items_stock_on_hand_index');
        });

        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->index(['business_id', 'occurred_at'], 'movements_business_occurred_index');
            $table->dropIndex('inventory_movements_occurred_at_index');
        });
    }

    public function down(): void
    {
        /*
         * InnoDB adopts the first index that starts with `business_id` as the
         * one enforcing that foreign key, and silently drops the single-column
         * index it made for itself. So each composite below cannot be dropped
         * until a plain `business_id` index exists again to take its place.
         */
        foreach (['orders', 'order_items', 'expenses', 'products', 'customers', 'inventory_items', 'inventory_movements'] as $table) {
            $this->ensureForeignKeyIndex($table);
        }

        Schema::table('inventory_movements', function (Blueprint $table): void {
            $table->index('occurred_at', 'inventory_movements_occurred_at_index');
            $table->dropIndex('movements_business_occurred_index');
        });

        Schema::table('inventory_items', function (Blueprint $table): void {
            $table->index('stock_on_hand', 'inventory_items_stock_on_hand_index');
            $table->dropIndex('inventory_business_stock_index');
        });

        Schema::table('customers', function (Blueprint $table): void {
            $table->index('created_at', 'customers_created_at_index');
            $table->index('is_active', 'customers_is_active_index');

            $table->dropIndex('customers_business_created_index');
            $table->dropIndex('customers_business_active_index');
        });

        Schema::table('products', fn (Blueprint $table) => $table->dropIndex('products_business_active_index'));

        Schema::table('expenses', function (Blueprint $table): void {
            $table->index('incurred_on', 'expenses_incurred_on_index');
            $table->dropIndex('expenses_business_incurred_index');
        });

        Schema::table('order_items', fn (Blueprint $table) => $table->dropIndex('order_items_business_order_index'));

        Schema::table('orders', function (Blueprint $table): void {
            $table->index(['status', 'placed_at'], 'orders_status_placed_at_index');
            $table->index(['status', 'created_at'], 'orders_status_created_at_index');
            $table->index('placed_at', 'orders_placed_at_index');

            $table->dropIndex('orders_business_created_index');
            $table->dropIndex('orders_business_status_placed_index');
            $table->dropIndex('orders_business_status_created_index');
            $table->dropIndex('orders_business_customer_placed_index');
        });
    }

    /** Give a table back the single-column `business_id` index, if it has none. */
    private function ensureForeignKeyIndex(string $table): void
    {
        $name = $table.'_business_id_foreign';

        $exists = DB::table('information_schema.statistics')
            ->where('table_schema', DB::raw('DATABASE()'))
            ->where('table_name', $table)
            ->where('index_name', $name)
            ->exists();

        if (! $exists) {
            DB::statement("CREATE INDEX {$name} ON {$table} (business_id)");
        }
    }
};
