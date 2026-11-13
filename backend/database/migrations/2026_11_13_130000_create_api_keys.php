<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Keys for the universal connection (2026-11-13).
 *
 * Salla and Zid each need a partner app; most systems a merchant runs do not
 * have one with Baydar and never will. A key lets any of them send orders in:
 * WooCommerce, Shopify, a till, the merchant's own system, or Zapier, Make
 * and n8n in between. One key per system, so each can be revoked alone.
 *
 * Only a SHA-256 of the key is kept. The key itself is shown once, when it is
 * made, and cannot be read back: a leaked database leaks no working key.
 * `prefix` is the first characters, to find the row and to let the owner tell
 * keys apart on screen.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('api_keys', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('business_id')->constrained('businesses')->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('prefix', 16)->unique();
            $table->char('hash', 64);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('last_used_at')->nullable();
            $table->unsignedInteger('orders_received')->default(0);
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['business_id', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('api_keys');
    }
};
