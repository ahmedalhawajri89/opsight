<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * More than one business in one database (ADR-023, superseding ADR-001).
 *
 * Every table that holds a business's data gains `business_id`, NOT NULL and
 * a foreign key, so a row that belongs to nobody cannot exist. The children of
 * an order carry it too rather than inheriting it through a join: the metric
 * queries read order_items, payments and refunds directly, and a filter that
 * needs a join to apply is a filter one query will forget.
 *
 * Uniqueness that meant "in this business" becomes composite: two businesses
 * may both sell a SKU-1, and both number their orders from ORD-2026-000001.
 * A user's email stays unique across the whole installation, because signing
 * in is by email and must name exactly one account.
 *
 * `business_settings` stops being a singleton: the CHECK (id = 1) goes, and
 * one row per business is enforced by UNIQUE(business_id) instead.
 *
 * Existing data — a single-business installation — is moved into one business
 * named after its settings. On a fresh database there is nothing to move and
 * no business is invented.
 *
 * The audit log is the one table where business_id may be null: a failed
 * sign-in for an address that matches no account belongs to no business.
 */
return new class extends Migration
{
    /** Tables whose every row belongs to a business. */
    private const OWNED = [
        'business_settings',
        'categories',
        'products',
        'customers',
        'inventory_items',
        'inventory_movements',
        'orders',
        'order_items',
        'order_payments',
        'order_refunds',
        'expense_categories',
        'expenses',
        'users',
    ];

    /** [table, old unique index, columns of the new composite unique] */
    private const UNIQUES = [
        ['products', 'products_sku_unique', ['sku']],
        ['customers', 'customers_email_unique', ['email']],
        ['orders', 'orders_reference_unique', ['reference']],
        ['categories', 'categories_slug_unique', ['slug']],
        ['expense_categories', 'expense_categories_name_unique', ['name']],
        ['expense_categories', 'expense_categories_slug_unique', ['slug']],
    ];

    public function up(): void
    {
        Schema::create('businesses', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 160);
            $table->string('slug', 80)->unique();
            // active | suspended. Suspension is a later phase; the column is
            // here so it is not another migration across every table.
            $table->string('status', 16)->default('active');
            $table->timestamps();
        });

        $default = $this->defaultBusiness();

        foreach ([...self::OWNED, 'activity_logs'] as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->foreignId('business_id')->nullable()->after('id')->constrained()->restrictOnDelete();
            });

            if ($default !== null) {
                DB::table($table)->update(['business_id' => $default]);
            }
        }

        foreach (self::OWNED as $table) {
            DB::statement("ALTER TABLE {$table} MODIFY business_id BIGINT UNSIGNED NOT NULL");
        }

        foreach (self::UNIQUES as [$table, $index, $columns]) {
            Schema::table($table, function (Blueprint $blueprint) use ($index, $columns): void {
                $blueprint->dropUnique($index);
                $blueprint->unique(['business_id', ...$columns]);
            });
        }

        // One settings row per business, instead of one row in total.
        DB::statement('ALTER TABLE business_settings DROP CONSTRAINT chk_business_settings_singleton');
        DB::statement('ALTER TABLE business_settings MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT');

        Schema::table('business_settings', function (Blueprint $table): void {
            $table->unique('business_id');
        });

        // The audit log is read per business, newest first.
        Schema::table('activity_logs', function (Blueprint $table): void {
            $table->index(['business_id', 'created_at']);
        });
    }

    public function down(): void
    {
        if (DB::table('businesses')->count() > 1) {
            throw new RuntimeException('More than one business exists; rolling back would merge their data.');
        }

        /*
         * Foreign keys first. InnoDB backs a foreign key with any index that
         * starts with its column, and drops the one it made for itself once a
         * composite like (business_id, sku) exists — so those composites
         * cannot be dropped while the key still needs them.
         */
        foreach ([...self::OWNED, 'activity_logs'] as $table) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropForeign(['business_id']));
        }

        Schema::table('activity_logs', fn (Blueprint $table) => $table->dropIndex(['business_id', 'created_at']));

        Schema::table('business_settings', fn (Blueprint $table) => $table->dropUnique(['business_id']));
        DB::statement('ALTER TABLE business_settings MODIFY id TINYINT UNSIGNED NOT NULL');
        DB::statement('ALTER TABLE business_settings ADD CONSTRAINT chk_business_settings_singleton CHECK (id = 1)');

        foreach (array_reverse(self::UNIQUES) as [$table, $index, $columns]) {
            Schema::table($table, function (Blueprint $blueprint) use ($index, $columns): void {
                $blueprint->dropUnique(['business_id', ...$columns]);
                $blueprint->unique($columns, $index);
            });
        }

        foreach ([...self::OWNED, 'activity_logs'] as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->dropColumn('business_id');
            });
        }

        Schema::dropIfExists('businesses');
    }

    /** The business existing data moves into, or null on an empty database. */
    private function defaultBusiness(): ?int
    {
        $settings = DB::table('business_settings')->first();

        if ($settings === null && ! DB::table('users')->exists()) {
            return null;
        }

        return (int) DB::table('businesses')->insertGetId([
            'name' => $settings->company_name ?? 'Opsight',
            'slug' => 'default',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
};
