<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The one figure the cash forecast cannot compute (phase D2).
 *
 * Baydar knows what was sold, owed, paid and spent; it does not know what
 * is in the bank. The owner states it, with the day it was true, and the
 * forecast starts from there. Null until stated: the forecast then shows
 * each week's net flow and its running total, which is still the shape of
 * the next quarter, just not its level.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('business_settings', function (Blueprint $table): void {
            $table->decimal('cash_balance', 15, 3)->nullable();
            $table->date('cash_balance_as_of')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('business_settings', function (Blueprint $table): void {
            $table->dropColumn(['cash_balance', 'cash_balance_as_of']);
        });
    }
};
