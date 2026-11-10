<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * What Zid needs that Salla did not (ADR-037).
 *
 * `authorization_token` — Zid issues TWO credentials per store and every call
 * needs both: `authorization` goes in `Authorization: Bearer`, `access_token`
 * in `X-Manager-Token`. The existing column keeps the access token; this one
 * holds the other. TEXT for the same reason as its neighbours: it is
 * ciphertext, encrypted by the model's cast, and the token inside is a JWT.
 *
 * `refresh_token_expires_at` — Zid's refresh token lives one year while the
 * tokens it renews live three. A connection whose access token looks healthy
 * for another two years is therefore unrecoverable after twelve months unless
 * it refreshes in time, and the only way to know when is to store it. Null
 * for providers that do not say, which is how Salla's rows stay.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('integrations', function (Blueprint $table): void {
            $table->text('authorization_token')->nullable()->after('access_token');
            $table->timestamp('refresh_token_expires_at')->nullable()->after('token_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('integrations', function (Blueprint $table): void {
            $table->dropColumn(['authorization_token', 'refresh_token_expires_at']);
        });
    }
};
