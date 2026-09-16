<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Expense categories.
 *
 * A lookup table rather than a free-text field on `expenses`, because the
 * expense breakdown is an analytics surface — free text would make it
 * unreliable the first time someone types "Marketing " with a trailing space.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expense_categories', function (Blueprint $table): void {
            $table->id();

            $table->string('name', 120)->unique();
            $table->string('slug', 140)->unique();
            $table->boolean('is_active')->default(true);

            $table->softDeletes();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expense_categories');
    }
};
