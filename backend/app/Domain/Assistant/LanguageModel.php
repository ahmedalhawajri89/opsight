<?php

declare(strict_types=1);

namespace App\Domain\Assistant;

/**
 * Whatever answers Ask Baydar's questions (ADR-038).
 *
 * An interface so the conversation logic — which tools a role gets, the tool
 * loop, metering, what is stored — is tested against a scripted model, and
 * the one class that talks to Anthropic stays small enough to read.
 */
interface LanguageModel
{
    /**
     * @param  string  $system  the fixed instructions; cached
     * @param  list<array<string, mixed>>  $tools  tool definitions; cached with the system prompt
     * @param  list<array<string, mixed>>  $messages  the conversation so far
     */
    public function respond(string $system, array $tools, array $messages): ModelReply;
}
