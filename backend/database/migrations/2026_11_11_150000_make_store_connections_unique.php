<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One store, one business.
 *
 * Both connection paths already refuse a store that is connected elsewhere
 * (ConnectZidStore, ClaimStore), but they check and then write, and two
 * businesses completing the flow at the same moment could both pass the
 * check. The index is the one guard that cannot lose that race: a second
 * row for the same store is refused by the database. NULL ids, before a
 * store has said who it is, are not compared.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('integrations', function (Blueprint $table): void {
            $table->unique(['provider', 'external_account_id'], 'integrations_store_unique');
        });
    }

    public function down(): void
    {
        Schema::table('integrations', function (Blueprint $table): void {
            $table->dropUnique('integrations_store_unique');
        });
    }
};
