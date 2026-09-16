<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The stock ledger. APPEND-ONLY, and the source of truth for inventory.
 *
 * Stock is never "set"; it is moved. A mistake is corrected by a compensating
 * entry, so both the error and its correction stay on record.
 *
 * NOTE the absence of `updated_at` and `deleted_at`. A ledger entry is never
 * edited or removed, so columns implying otherwise would be a lie in the
 * schema (DATABASE_DESIGN.md §3.9).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_movements', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();

            // Signed: negative for a sale, positive for a restock.
            $table->integer('quantity_delta');

            // Stock after this movement — makes the ledger auditable at a
            // glance without recomputing a running sum.
            $table->integer('balance_after');

            $table->enum('reason', [
                'sale',
                'sale_cancelled',
                'sale_refunded',
                'restock',
                'adjustment',
                'damage',
                'loss',
                'initial',
            ]);

            // Polymorphic: 'order' | 'manual'
            $table->string('reference_type', 48)->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();

            // Cost on a restock — the input to any future inventory valuation,
            // captured now so ADR-014 has a cost basis to work from later.
            $table->decimal('unit_cost', 15, 4)->nullable();

            // Required when reason = 'adjustment'; enforced in the domain.
            $table->string('note', 255)->nullable();

            $table->foreignId('created_by')->nullable()
                ->constrained('users')->nullOnDelete();

            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['product_id', 'occurred_at']);
            $table->index(['reference_type', 'reference_id']);
            $table->index(['reason', 'occurred_at']);
            $table->index('occurred_at');
        });

        // A zero-delta movement records nothing and would pollute the ledger.
        DB::statement('ALTER TABLE inventory_movements ADD CONSTRAINT chk_movement_delta_non_zero CHECK (quantity_delta <> 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
    }
};
