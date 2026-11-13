<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Several stores on one platform (2026-11-13).
 *
 * A merchant may run two Salla stores, or a WooCommerce shop per country, and
 * keep one set of books. The old rule, one connection per provider per
 * business, is replaced by the rule that actually matters: ONE STORE BELONGS
 * TO ONE BUSINESS. That was checked in code before every connect; it is now
 * the database's to enforce, so a race between two owners cannot be lost.
 *
 * The business index is added before the unique key it replaces is dropped:
 * the foreign key on business_id needs an index under it at every moment.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('integrations', function (Blueprint $table): void {
            $table->index(['business_id', 'provider']);
        });

        Schema::table('integrations', function (Blueprint $table): void {
            $table->dropUnique(['business_id', 'provider']);
            $table->unique(['provider', 'external_account_id']);
        });
    }

    public function down(): void
    {
        Schema::table('integrations', function (Blueprint $table): void {
            $table->dropUnique(['provider', 'external_account_id']);
            $table->unique(['business_id', 'provider']);
        });

        Schema::table('integrations', function (Blueprint $table): void {
            $table->dropIndex(['business_id', 'provider']);
        });
    }
};
