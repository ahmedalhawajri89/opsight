<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Operating expenses.
 *
 * These are OPERATING expenses only. The cost of goods reaches profit through
 * COGS from `order_items`, never as an expense row — recording a stock purchase
 * here would double-count it, so the restock flow never creates one and the UI
 * says so (MVP_SCOPE.md §6.7).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('expense_category_id')
                ->constrained('expense_categories')->restrictOnDelete();

            $table->string('description', 255);
            $table->decimal('amount', 15, 2);

            // A DATE, not a timestamp. An expense happens on a day; forcing a
            // time would invent precision and create a timezone bug at every
            // period boundary (DATABASE_DESIGN.md §2).
            $table->date('incurred_on');

            $table->string('vendor', 180)->nullable();
            $table->string('reference', 80)->nullable();
            $table->text('notes')->nullable();

            $table->foreignId('created_by')->nullable()
                ->constrained('users')->nullOnDelete();

            $table->softDeletes();
            $table->timestamps();

            $table->index('incurred_on');
            $table->index(['expense_category_id', 'incurred_on']);
            $table->index('created_by');
        });

        DB::statement('ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount_positive CHECK (amount > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
