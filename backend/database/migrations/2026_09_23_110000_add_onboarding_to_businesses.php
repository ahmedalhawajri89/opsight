<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Self-service sign-up (P2 phase 3, ADR-024).
 *
 * `country` is where the business trades, chosen in the setup wizard; it
 * picks the defaults for currency, week and VAT, and later the rules a market
 * brings with it. `onboarded_at` records that the owner finished the wizard:
 * until then an owner who signs in is taken back to it.
 *
 * Businesses that existed before sign-up were set up by hand, so they count
 * as onboarded from the moment they were created.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('businesses', function (Blueprint $table): void {
            $table->char('country', 2)->nullable()->after('slug');
            $table->timestamp('onboarded_at')->nullable()->after('status');
        });

        DB::table('businesses')->update(['onboarded_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('businesses', function (Blueprint $table): void {
            $table->dropColumn(['country', 'onboarded_at']);
        });
    }
};
