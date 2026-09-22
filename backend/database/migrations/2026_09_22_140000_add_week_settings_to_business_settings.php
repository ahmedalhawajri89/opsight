<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * The business week (ADR-020).
 *
 * `week_starts_on` decides where every weekly bucket begins. ISO numbering,
 * 1 = Monday … 7 = Sunday. It defaults to Monday, which is what every weekly
 * figure has used until now, so nothing moves until an Owner chooses Sunday or
 * Saturday.
 *
 * `weekend_days` are the business's days off, ISO numbered. Friday and Saturday
 * by default, the weekend across most of the Gulf. They reshape no figure;
 * they mark days on the daily charts, so a quiet Friday reads as a weekend
 * rather than a drop.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('business_settings', function (Blueprint $table): void {
            $table->unsignedTinyInteger('week_starts_on')->default(1);
            $table->json('weekend_days')->nullable();
        });

        DB::table('business_settings')->update(['weekend_days' => json_encode([5, 6])]);

        DB::statement('ALTER TABLE business_settings ADD CONSTRAINT chk_business_settings_week_start CHECK (week_starts_on BETWEEN 1 AND 7)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE business_settings DROP CONSTRAINT chk_business_settings_week_start');

        Schema::table('business_settings', fn (Blueprint $table) => $table->dropColumn(['week_starts_on', 'weekend_days']));
    }
};
