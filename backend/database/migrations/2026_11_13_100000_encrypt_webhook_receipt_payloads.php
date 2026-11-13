<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * A delivery's payload, encrypted at rest (security audit, 2026-11-13).
 *
 * Salla's install event carries the store's access and refresh tokens in its
 * body. The tokens were encrypted where they were kept (`integrations`,
 * `unclaimed_integrations`), and in clear here, in the receipt of the very
 * delivery that brought them — so a database dump or a backup handed over a
 * working key to every merchant's store. Order deliveries carry customers'
 * names, phones and addresses the same way.
 *
 * The column becomes text, because a ciphertext is not JSON, and every row
 * already stored is encrypted in place. Nothing queries inside the payload
 * in SQL; it is only ever read back whole by the model, which now decrypts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('webhook_receipts', function (Blueprint $table): void {
            $table->longText('payload')->change();
        });

        DB::table('webhook_receipts')->orderBy('id')->chunkById(200, function ($rows): void {
            foreach ($rows as $row) {
                DB::table('webhook_receipts')
                    ->where('id', $row->id)
                    ->update(['payload' => Crypt::encryptString((string) $row->payload)]);
            }
        });
    }

    public function down(): void
    {
        DB::table('webhook_receipts')->orderBy('id')->chunkById(200, function ($rows): void {
            foreach ($rows as $row) {
                DB::table('webhook_receipts')
                    ->where('id', $row->id)
                    ->update(['payload' => Crypt::decryptString((string) $row->payload)]);
            }
        });

        Schema::table('webhook_receipts', function (Blueprint $table): void {
            $table->json('payload')->change();
        });
    }
};
