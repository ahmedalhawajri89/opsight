<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user language and digit preferences (Phase 07).
 *
 * On the USER, not in a browser cookie, for two reasons. The choice should
 * follow a person to another device. And the server writes sentences of its
 * own — insights, validation messages, business-rule refusals — so it has to
 * know the reader's language without being told on every request.
 *
 * Two columns rather than one locale tag, because they are independent
 * decisions: an Arabic reader may well want Western digits (the norm in Gulf
 * accounting software), and the choice of digits must not be buried inside a
 * BCP 47 extension nobody can read in the database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // 'en' | 'ar'. Constrained below so a bad value cannot be stored by
            // any path, including a manual UPDATE.
            $table->string('locale', 5)->default('en')->after('role');

            // 'latn' (0-9) | 'arab' (٠-٩). Unicode CLDR numbering-system names,
            // so the value passes straight into Intl and ICU unchanged.
            $table->string('numerals', 4)->default('latn')->after('locale');
        });

        DB::statement("ALTER TABLE users ADD CONSTRAINT users_locale_check CHECK (locale IN ('en', 'ar'))");
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_numerals_check CHECK (numerals IN ('latn', 'arab'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT users_locale_check');
        DB::statement('ALTER TABLE users DROP CONSTRAINT users_numerals_check');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['locale', 'numerals']);
        });
    }
};
