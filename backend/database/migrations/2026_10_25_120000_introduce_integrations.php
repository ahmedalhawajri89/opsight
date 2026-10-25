<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The plumbing every integration needs, before any integration exists
 * (ADR-027).
 *
 * Three pieces, each of which has to be in place BEFORE the first importer
 * writes a row rather than retrofitted around it:
 *
 * `integrations` — one connected account per business per provider, with its
 * tokens. The tokens are encrypted by the model's cast, not by the column
 * type, so the column is a TEXT holding ciphertext.
 *
 * `source` / `external_id` on the three tables an importer creates rows in.
 * This pair is what makes importing idempotent: re-importing the same order
 * must update the row it made last time, not make a second one. Added now,
 * empty, because adding it later means reconciling whatever duplicates the
 * first run already created.
 *
 * `webhook_receipts` — every delivery is stored before it is acted on, keyed
 * by the provider's own event id. A provider that retries (all of them do)
 * must not produce two orders, and a signature that does not verify must
 * leave a record that it arrived.
 */
return new class extends Migration
{
    /** The tables an integration creates rows in. */
    private const IMPORTED = ['products', 'customers', 'orders'];

    public function up(): void
    {
        Schema::create('integrations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('business_id')->constrained('businesses')->cascadeOnDelete();

            // 'salla', 'zid', 'whatsapp'. Not an enum: a provider added in a
            // later phase must not need a schema change in this one.
            $table->string('provider', 32);

            // The store or account id at the provider's end, for the support
            // question "which of their stores is this?".
            $table->string('external_account_id', 190)->nullable();

            $table->enum('status', ['connected', 'expired', 'revoked', 'error'])->default('connected');

            /*
             * TEXT, not a short string: these hold ciphertext, which is
             * several times the length of the token inside it, and a JWT is
             * long before it is encrypted.
             */
            $table->text('access_token')->nullable();
            $table->text('refresh_token')->nullable();
            $table->timestamp('token_expires_at')->nullable();

            // What the business actually granted, as the provider named it.
            $table->json('scopes')->nullable();

            $table->timestamp('last_synced_at')->nullable();
            $table->text('last_error')->nullable();

            $table->timestamps();

            // One connection per provider per business. A second connection
            // to the same store is a reconnection, not another integration.
            $table->unique(['business_id', 'provider']);
        });

        foreach (self::IMPORTED as $name) {
            Schema::table($name, function (Blueprint $table) use ($name): void {
                /*
                 * NULL means "entered here". Not a default of 'manual',
                 * because three years of existing rows were entered here and
                 * backfilling them would be writing a fact we did not record.
                 */
                $table->string('source', 32)->nullable()->after('business_id');
                $table->string('external_id', 190)->nullable()->after('source');

                // The idempotency key. NULLs do not collide in MySQL and
                // MariaDB, so every manually entered row is exempt.
                $table->unique(['business_id', 'source', 'external_id'], "{$name}_source_unique");
            });
        }

        Schema::create('webhook_receipts', function (Blueprint $table): void {
            $table->id();

            /*
             * Nullable, and deliberately so. The business is resolved FROM the
             * payload after the signature verifies, and a delivery that fails
             * verification — the one most worth keeping — may name no business
             * we recognise. A receipt is stored before it is understood.
             */
            $table->foreignId('business_id')->nullable()->constrained('businesses')->nullOnDelete();

            $table->string('provider', 32);
            $table->string('event', 64);

            /*
             * The provider's own id for this delivery, which is what makes a
             * retry recognisable. UNIQUE across providers because the column
             * carries the provider's namespace in practice; a collision
             * between two providers' id schemes would be a rejected duplicate,
             * which is the safe direction to fail.
             */
            $table->string('external_event_id', 190)->unique();

            $table->json('payload');
            $table->boolean('signature_ok');
            $table->timestamp('processed_at')->nullable();
            $table->text('error')->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamps();

            // "What arrived from Salla last night, and what is still unhandled?"
            $table->index(['provider', 'created_at']);
            $table->index(['business_id', 'processed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_receipts');

        foreach (self::IMPORTED as $name) {
            Schema::table($name, function (Blueprint $table) use ($name): void {
                $table->dropUnique("{$name}_source_unique");
                $table->dropColumn(['source', 'external_id']);
            });
        }

        Schema::dropIfExists('integrations');
    }
};
