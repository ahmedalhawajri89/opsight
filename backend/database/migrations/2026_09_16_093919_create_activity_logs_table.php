<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only audit trail.
 *
 * No `updated_at`, no `deleted_at`, and the application exposes no update or
 * delete path. In a hardened deployment the app's database user is granted
 * INSERT and SELECT only on this table, so tampering requires administrative
 * access — which is itself auditable (SECURITY.md §10).
 *
 * The highest-growth table in the system, which is why its API uses cursor
 * pagination and why monthly partitioning is noted as a Post-MVP option.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_logs', function (Blueprint $table): void {
            $table->id();

            // Null for system actions; SET NULL so a deactivated user's history
            // stays readable.
            $table->foreignId('user_id')->nullable()
                ->constrained('users')->nullOnDelete();

            // e.g. order.confirmed, product.updated, auth.login_failed
            $table->string('action', 64);

            $table->string('subject_type', 64)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();

            // { before: {...}, after: {...} } — CHANGED ATTRIBUTES ONLY, and
            // never a key on the redaction list (passwords, tokens).
            $table->json('changes')->nullable();

            // Filters used on an export, a transition reason, and so on.
            $table->json('context')->nullable();

            // Packed, so it holds IPv4 and IPv6 in 16 bytes.
            $table->binary('ip_address', 16)->nullable();
            $table->string('user_agent', 255)->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->index(['subject_type', 'subject_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
            $table->index(['action', 'created_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};
