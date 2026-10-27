<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A store that has connected itself, before anyone has said whose it is.
 *
 * Salla's Easy mode — the only mode its documentation allows for a published
 * app — delivers a store's tokens in an `app.store.authorize` webhook, and
 * that delivery carries NOTHING identifying the business it belongs to in
 * this system. There is no state parameter, no query string on the install
 * URL, and no redirect back. So for a moment a real connection exists that
 * belongs to nobody, and it has to live somewhere.
 *
 * Not in `integrations`: that table's `business_id` is NOT NULL and is what
 * makes every read of it safe. Loosening it so one row could be ownerless
 * would weaken the guarantee for every other row, to model a state that is
 * meant to last minutes.
 *
 * So, a table of its own, with no `business_id` at all — the same reasoning
 * as `webhook_receipts` carrying neither tenancy trait. A row here is claimed
 * by a business and moved, or it expires and is deleted. It is never read as
 * though it were a connection.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unclaimed_integrations', function (Blueprint $table): void {
            $table->id();
            $table->string('provider', 32);

            // The provider's own id for the store: Salla's `merchant`.
            $table->string('external_account_id', 190);

            $table->text('access_token')->nullable();
            $table->text('refresh_token')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->json('scopes')->nullable();

            /*
             * Shown to the owner after they claim it, so a wrong claim is
             * visible immediately rather than discovered when someone else's
             * orders appear on their dashboard.
             */
            $table->string('store_name', 190)->nullable();

            /*
             * Unclaimed tokens are a liability, not an asset. After this they
             * are deleted and the merchant reinstalls — which costs a minute,
             * where a forgotten row is a live key to someone's shop sitting
             * in a table that nothing reads.
             */
            /*
             * `useCurrent` only to give MariaDB a legal default: this is not
             * the first TIMESTAMP column in the table, so without one it gets
             * an implicit '0000-00-00' that NO_ZERO_DATE then refuses. Every
             * row sets the value explicitly; the default is never reached.
             */
            $table->timestamp('expires_at')->useCurrent();

            $table->timestamps();

            // One pending connection per store. A merchant who installs twice
            // replaces their own row rather than leaving a stale set of
            // tokens behind it.
            $table->unique(['provider', 'external_account_id']);
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unclaimed_integrations');
    }
};
