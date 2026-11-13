<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The least cash the owner wants to keep in hand.
 *
 * A negative balance is too late to be a warning: rent and salaries need
 * paying well before the account reaches zero. The owner names the floor,
 * and the forecast marks every week expected to fall below it. Null until
 * stated; then the forecast falls back to marking only the negative weeks.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('business_settings', function (Blueprint $table): void {
            $table->decimal('cash_safety_threshold', 15, 3)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('business_settings', function (Blueprint $table): void {
            $table->dropColumn('cash_safety_threshold');
        });
    }
};
