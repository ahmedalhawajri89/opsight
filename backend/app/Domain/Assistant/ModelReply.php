<?php

declare(strict_types=1);

namespace App\Domain\Assistant;

/**
 * One response from the model, as plain arrays (ADR-038).
 *
 * `content` is kept in the shape the API takes back — the model expects its
 * own earlier turns returned unchanged, thinking blocks and their signatures
 * included — and in keys that are spelt the same in the SDK's camelCase and
 * the wire's snake_case (`type`, `text`, `id`, `name`, `input`, `thinking`,
 * `signature`, `data`), so storing and replaying it needs no translation.
 */
final readonly class ModelReply
{
    /**
     * @param  list<array<string, mixed>>  $content
     */
    public function __construct(
        public string $stopReason,
        public array $content,
        public int $inputTokens = 0,
        public int $outputTokens = 0,
        public int $cacheReadTokens = 0,
        public int $cacheWriteTokens = 0,
    ) {}

    /** @return list<array<string, mixed>> */
    public function toolCalls(): array
    {
        return array_values(array_filter($this->content, static fn (array $block): bool => ($block['type'] ?? null) === 'tool_use'));
    }

    public function text(): string
    {
        $parts = array_map(
            static fn (array $block): string => (string) ($block['text'] ?? ''),
            array_filter($this->content, static fn (array $block): bool => ($block['type'] ?? null) === 'text'),
        );

        return trim(implode("\n\n", $parts));
    }
}
