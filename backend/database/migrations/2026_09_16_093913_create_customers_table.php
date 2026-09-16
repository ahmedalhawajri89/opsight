<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customers.
 *
 * Deliberately WITHOUT `total_orders`, `total_spent` or `first_order_at`.
 *
 * Every one of those is a metric derived from `orders`, and storing it creates
 * a second source of truth that goes wrong the first time an order is
 * cancelled or backdated. If aggregation becomes slow the answer is ADR-009's
 * rebuildable rollup, not a denormalised counter nobody recomputes
 * (DATABASE_DESIGN.md §3.5).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table): void {
            $table->id();

            $table->string('name', 180);

            // Unique, but nullable: NULLs do not collide in MySQL/MariaDB,
            // which is exactly the behaviour wanted for walk-in trade.
            $table->string('email', 190)->nullable()->unique();

            $table->string('phone', 40)->nullable();
            $table->string('company', 180)->nullable();
            $table->string('address_line', 255)->nullable();
            $table->string('city', 120)->nullable();
            $table->char('country', 2)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);

            $table->foreignId('created_by')->nullable()
                ->constrained('users')->nullOnDelete();

            $table->softDeletes();
            $table->timestamps();

            $table->index('name');
            $table->index('created_at');
            $table->index('country');
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
