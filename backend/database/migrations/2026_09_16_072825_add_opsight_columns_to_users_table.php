<?php

declare(strict_types=1);

use App\Authorization\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds Opsight's own columns to Laravel's default users table.
 *
 * `role` is an enum rather than a foreign key to a roles table (ADR-003).
 * `is_active` replaces deletion — users are deactivated, never removed, so
 * that historical activity_logs and created_by references stay resolvable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->enum('role', Role::values())
                ->default(Role::Staff->value)
                ->after('password');

            $table->boolean('is_active')->default(true)->after('role');
            $table->timestamp('last_login_at')->nullable()->after('is_active');

            $table->index(['role', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['role', 'is_active']);
            $table->dropColumn(['role', 'is_active', 'last_login_at']);
        });
    }
};
