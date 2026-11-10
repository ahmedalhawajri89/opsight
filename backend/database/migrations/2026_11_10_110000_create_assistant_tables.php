<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Ask Baydar's conversations (ADR-038).
 *
 * KEPT ON THE SERVER, NOT SENT BY THE BROWSER. A history the client sends
 * back is a history the client can write: an "assistant" turn saying the
 * margin was 90%, or a tool result inventing a figure. Stored here, the only
 * tool results the model ever sees are ones this server produced.
 *
 * `content` is the turn exactly as the API exchanged it — text, tool calls,
 * tool results, thinking blocks with their signatures — because the model
 * expects its own earlier turns back unchanged. `display` is what the screen
 * shows: the question as typed, the answer as written.
 *
 * Token counts live on the assistant turns, so a business's monthly use is a
 * SUM over one indexed column range.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assistant_conversations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('business_id')->constrained('businesses')->cascadeOnDelete();
            // One person's conversation. A colleague with the same role still
            // does not read it.
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title', 160);
            $table->timestamps();

            $table->index(['business_id', 'user_id', 'updated_at']);
        });

        Schema::create('assistant_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('business_id')->constrained('businesses')->cascadeOnDelete();
            $table->foreignId('conversation_id')->constrained('assistant_conversations')->cascadeOnDelete();
            $table->string('role', 16);
            $table->json('content');
            $table->text('display')->nullable();
            // The figures behind an answer: which tool, with what, over which
            // period. Shown beside it so every number can be traced (ADR-038).
            $table->json('sources')->nullable();
            $table->unsignedInteger('input_tokens')->default(0);
            $table->unsignedInteger('output_tokens')->default(0);
            $table->unsignedInteger('cache_read_tokens')->default(0);
            $table->unsignedInteger('cache_write_tokens')->default(0);
            $table->timestamps();

            $table->index(['conversation_id', 'id']);
            $table->index(['business_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assistant_messages');
        Schema::dropIfExists('assistant_conversations');
    }
};
