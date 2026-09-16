<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Business configuration that an Owner edits at runtime — deliberately not in
 * .env, because currency, timezone and fiscal year are business data rather
 * than deployment configuration.
 *
 * This is a singleton table, not multi-tenancy (ADR-001). The CHECK constraint
 * makes the single row structural rather than a convention nobody enforces.
 *
 * `timezone` matters more than it looks: every metric period boundary is
 * resolved in it before being converted to UTC for querying.
 * See docs/database/METRICS.md §1.2.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_settings', function (Blueprint $table): void {
            // Deliberately NOT auto-incrementing. The row is a singleton with a
            // fixed id of 1, so a sequence would be meaningless — and MariaDB
            // refuses a CHECK constraint on an AUTO_INCREMENT column, which is
            // what would enforce the singleton.
            $table->unsignedTinyInteger('id')->primary();

            $table->string('company_name', 160);
            $table->char('currency', 3)->default('BHD');
            $table->unsignedTinyInteger('currency_decimals')->default(3);
            $table->string('timezone', 64)->default('Asia/Bahrain');
            $table->unsignedTinyInteger('fiscal_year_start_month')->default(1);
            $table->unsignedInteger('default_low_stock_threshold')->default(10);

            $table->timestamps();
        });

        // Enforced in MariaDB 10.4+ and MySQL 8.0.16+, so the singleton is real
        // rather than documentation.
        DB::statement('ALTER TABLE business_settings ADD CONSTRAINT chk_business_settings_singleton CHECK (id = 1)');
        DB::statement('ALTER TABLE business_settings ADD CONSTRAINT chk_business_settings_fiscal_month CHECK (fiscal_year_start_month BETWEEN 1 AND 12)');
    }

    public function down(): void
    {
        Schema::dropIfExists('business_settings');
    }
};
