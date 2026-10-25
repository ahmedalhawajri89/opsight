<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Compliance and retention (ADR-026).
 *
 * `activity_retention_days` is how long a business keeps its audit log. The
 * default of 730 is two years: long enough to answer "who changed this price
 * last spring?", and short enough that "how long do you keep it?" — the
 * data-minimisation question a Saudi buyer asks under PDPL — has an answer
 * that is not "for ever".
 *
 * The floor of 30 is deliberate. A retention window shorter than an
 * investigation is not a retention policy, it is an alibi — and the one person
 * who benefits from a three-day audit log is the person being audited. The
 * ceiling of ten years is the longest commercial-records requirement in the
 * Gulf.
 *
 * `customers.erased_at` makes "has this person been forgotten?" a fact in a
 * column rather than something inferred by sniffing a name for a sentinel.
 * The UI translates off it; the erasure refuses a second time off it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('business_settings', function (Blueprint $table): void {
            $table->unsignedSmallInteger('activity_retention_days')->default(730)->after('weekend_days');
        });

        DB::statement('ALTER TABLE business_settings ADD CONSTRAINT chk_business_settings_retention CHECK (activity_retention_days BETWEEN 30 AND 3650)');

        Schema::table('customers', function (Blueprint $table): void {
            $table->timestamp('erased_at')->nullable()->after('is_active');
        });
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE business_settings DROP CONSTRAINT chk_business_settings_retention');

        Schema::table('business_settings', fn (Blueprint $table) => $table->dropColumn('activity_retention_days'));
        Schema::table('customers', fn (Blueprint $table) => $table->dropColumn('erased_at'));
    }
};
