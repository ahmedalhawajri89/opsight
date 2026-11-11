<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What each business has spent on Ask Baydar, per month: a ledger that only
 * grows.
 *
 * The monthly cap used to be the sum over the messages that still exist,
 * and deleting a conversation deletes its messages. Ask, delete, ask again:
 * the cap was a suggestion. Usage is now written here after every model
 * call and read from here, and nothing a user can delete touches it.
 *
 * Seeded from the messages already stored, so the month in progress does
 * not start again from zero on the day this ships.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assistant_usage', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('business_id')->constrained('businesses')->cascadeOnDelete();
            // yyyy-mm in the business's own timezone.
            $table->char('month', 7);
            $table->unsignedBigInteger('tokens')->default(0);
            $table->timestamps();

            $table->unique(['business_id', 'month']);
        });

        DB::statement(
            "INSERT INTO assistant_usage (business_id, month, tokens, created_at, updated_at)
             SELECT business_id, DATE_FORMAT(created_at, '%Y-%m'), SUM(input_tokens + output_tokens + cache_write_tokens), NOW(), NOW()
             FROM assistant_messages
             GROUP BY business_id, DATE_FORMAT(created_at, '%Y-%m')"
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('assistant_usage');
    }
};
