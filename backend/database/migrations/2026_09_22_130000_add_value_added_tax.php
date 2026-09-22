<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Value-added tax (ADR-018).
 *
 * Every stored amount stays EXCLUDING VAT, so every revenue figure is correct
 * without touching a single metric. VAT is calculated per line at confirm,
 * snapshotted like price and cost, and kept in its own columns. Prices that
 * include VAT — the Gulf norm — are converted at that moment.
 *
 * Off by default: a business turns VAT on in its settings, and nothing about
 * orders confirmed before that changes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('business_settings', function (Blueprint $table): void {
            $table->boolean('vat_enabled')->default(false);
            // A percentage: 10.00 for Bahrain, 15.00 for Saudi Arabia, 5.00 for the UAE.
            $table->decimal('vat_rate', 5, 2)->default(0);
            // Shelf prices are what the customer pays, VAT inside — the Gulf norm.
            $table->boolean('prices_include_vat')->default(true);
            $table->string('vat_number', 32)->nullable();
            $table->string('commercial_registration', 32)->nullable();
        });

        Schema::table('products', function (Blueprint $table): void {
            // NULL follows the business rate; 0 is zero-rated or exempt.
            $table->decimal('vat_rate', 5, 2)->nullable()->after('cost');
        });

        Schema::table('order_items', function (Blueprint $table): void {
            // Snapshots, taken at confirm with price and cost.
            $table->decimal('vat_rate', 5, 2)->default(0)->after('line_total');
            $table->decimal('vat_taxable_amount', 15, 3)->default(0)->after('vat_rate');
            $table->decimal('vat_amount', 15, 3)->default(0)->after('vat_taxable_amount');
        });

        Schema::table('orders', function (Blueprint $table): void {
            $table->boolean('prices_include_vat')->default(false)->after('tax_amount');
            // The VAT part of a refund, kept apart so it never reduces revenue.
            $table->decimal('refunded_vat_amount', 15, 3)->default(0)->after('refunded_amount');
        });

        Schema::table('customers', function (Blueprint $table): void {
            $table->string('vat_number', 32)->nullable()->after('company');
        });

        DB::statement('ALTER TABLE business_settings ADD CONSTRAINT chk_business_settings_vat_rate CHECK (vat_rate >= 0 AND vat_rate <= 100)');
        DB::statement('ALTER TABLE products ADD CONSTRAINT chk_products_vat_rate CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100))');
        DB::statement('ALTER TABLE orders ADD CONSTRAINT chk_orders_refunded_vat CHECK (refunded_vat_amount >= 0)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE orders DROP CONSTRAINT chk_orders_refunded_vat');
        DB::statement('ALTER TABLE products DROP CONSTRAINT chk_products_vat_rate');
        DB::statement('ALTER TABLE business_settings DROP CONSTRAINT chk_business_settings_vat_rate');

        Schema::table('customers', fn (Blueprint $table) => $table->dropColumn('vat_number'));
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn(['prices_include_vat', 'refunded_vat_amount']));
        Schema::table('order_items', fn (Blueprint $table) => $table->dropColumn(['vat_rate', 'vat_taxable_amount', 'vat_amount']));
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn('vat_rate'));
        Schema::table('business_settings', fn (Blueprint $table) => $table->dropColumn([
            'vat_enabled', 'vat_rate', 'prices_include_vat', 'vat_number', 'commercial_registration',
        ]));
    }
};
