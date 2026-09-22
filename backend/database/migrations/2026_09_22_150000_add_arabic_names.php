<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Names in Arabic beside the name as entered (ADR-021).
 *
 * `name` stays the canonical name, whatever language it was typed in, so no
 * existing record changes and no editing round-trip can overwrite it. `name_ar`
 * is optional: shown to an Arabic reader when present, and the name falls back
 * when it is not.
 *
 * `order_items.product_name_ar` is a SNAPSHOT, like `product_name`: taken at
 * confirm, so renaming a product later does not rewrite what an old order sold.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', fn (Blueprint $table) => $table->string('name_ar', 180)->nullable()->after('name'));
        Schema::table('categories', fn (Blueprint $table) => $table->string('name_ar', 120)->nullable()->after('name'));
        Schema::table('customers', fn (Blueprint $table) => $table->string('name_ar', 180)->nullable()->after('name'));
        Schema::table('order_items', fn (Blueprint $table) => $table->string('product_name_ar', 180)->nullable()->after('product_name'));
    }

    public function down(): void
    {
        Schema::table('order_items', fn (Blueprint $table) => $table->dropColumn('product_name_ar'));
        Schema::table('customers', fn (Blueprint $table) => $table->dropColumn('name_ar'));
        Schema::table('categories', fn (Blueprint $table) => $table->dropColumn('name_ar'));
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn('name_ar'));
    }
};
