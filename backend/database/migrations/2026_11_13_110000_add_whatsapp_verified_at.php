<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * When the WhatsApp number on an account was proved to be its owner's
 * (security audit, 2026-11-13). The brief is sent only to a proved number;
 * any number saved before this has not been, and starts unproved.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('whatsapp_verified_at')->nullable()->after('whatsapp_phone');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('whatsapp_verified_at');
        });
    }
};
