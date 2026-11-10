<?php

declare(strict_types=1);

namespace App\Domain\Assistant;

use Anthropic\Client;

/**
 * Ask Baydar's questions, answered by Claude (ADR-038).
 *
 * Choices made here, each for a reason:
 *
 * - THE BETA NAMESPACE, for one parameter: `fallbacks: 'default'`. Claude
 *   Opus 5.5 runs safety classifiers that occasionally decline a benign
 *   request; with fallbacks the server retries on a model it chooses for that
 *   category, instead of the owner receiving nothing.
 * - CACHING. The system prompt and the tool definitions are identical on
 *   every request for a role, and are most of each request's input. The
 *   system block carries the breakpoint, which caches the tools rendered
 *   before it; the top-level `cacheControl` then caches the conversation as
 *   it grows. Nothing volatile — not even today's date — is in the system
 *   prompt; the date travels with each question instead.
 * - NO `thinking` PARAMETER. Thinking is always on for this model, and effort
 *   (`outputConfig`) is the only control. Sending `disabled` is a 400.
 * - NO FORCED TOOL CHOICE. This model rejects it; the prompt says to use the
 *   tools, and `strict` keeps their arguments schema-valid.
 */
final class ClaudeModel implements LanguageModel
{
    private const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

    public function __construct(private readonly Client $client) {}

    public function respond(string $system, array $tools, array $messages): ModelReply
    {
        $response = $this->client->beta->messages->create(
            model: (string) config('assistant.model'),
            maxTokens: 16000,
            system: [
                ['type' => 'text', 'text' => $system, 'cacheControl' => ['type' => 'ephemeral']],
            ],
            tools: $tools,
            messages: $messages,
            cacheControl: ['type' => 'ephemeral'],
            outputConfig: ['effort' => (string) config('assistant.effort')],
            fallbacks: 'default',
            betas: [self::FALLBACK_BETA],
        );

        $content = [];

        foreach ($response->content as $block) {
            $content[] = match ($block->type) {
                'text' => ['type' => 'text', 'text' => $block->text],
                'tool_use' => ['type' => 'tool_use', 'id' => $block->id, 'name' => $block->name, 'input' => (array) $block->input],
                // Passed back unchanged on the next request, signature and all.
                'thinking' => ['type' => 'thinking', 'thinking' => $block->thinking, 'signature' => $block->signature],
                'redacted_thinking' => ['type' => 'redacted_thinking', 'data' => $block->data],
                default => null,
            };
        }

        $usage = $response->usage;

        return new ModelReply(
            stopReason: (string) $response->stopReason,
            content: array_values(array_filter($content)),
            inputTokens: (int) $usage->inputTokens,
            outputTokens: (int) $usage->outputTokens,
            cacheReadTokens: (int) ($usage->cacheReadInputTokens ?? 0),
            cacheWriteTokens: (int) ($usage->cacheCreationInputTokens ?? 0),
        );
    }
}
