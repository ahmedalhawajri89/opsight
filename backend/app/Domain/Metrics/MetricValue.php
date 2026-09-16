<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

/**
 * One metric, with its comparison.
 *
 * THE RULES THIS CLASS EXISTS TO ENFORCE (METRICS.md §1.5):
 *
 * `change_pct` is null — never a number — when:
 *   - the previous value is 0 (division by zero),
 *   - the previous value is absent (no comparison requested),
 *   - the two values have OPPOSITE SIGNS. A loss of -500 becoming a profit of
 *     +500 is arithmetically 200% growth and means nothing; printing it would
 *     be worse than printing nothing.
 *
 * A null renders as an em dash with the absolute change beside it. The UI never
 * prints 0%, infinity or NaN, and never invents a figure to fill the space.
 */
final readonly class MetricValue
{
    private function __construct(
        public string $key,
        public int|string|float|null $value,
        public int|string|float|null $previous,
        public ?float $changeAbsolute,
        public ?float $changePercent,
        /** 'up' or 'down' — which direction is good news for THIS metric. */
        public string $favourable,
        /** 'money' | 'count' | 'ratio' — how the client should format it. */
        public string $format,
        public ?string $emptyReason,
    ) {}

    public static function make(
        string $key,
        int|string|float|null $value,
        int|string|float|null $previous = null,
        string $favourable = 'up',
        string $format = 'count',
        ?string $emptyReason = null,
    ): self {
        [$absolute, $percent] = self::change($value, $previous);

        return new self(
            key: $key,
            value: $value,
            previous: $previous,
            changeAbsolute: $absolute,
            changePercent: $percent,
            favourable: $favourable,
            format: $format,
            emptyReason: $emptyReason,
        );
    }

    /**
     * @return array{0: float|null, 1: float|null}
     */
    private static function change(int|string|float|null $value, int|string|float|null $previous): array
    {
        if ($value === null || $previous === null) {
            return [null, null];
        }

        $current = (float) $value;
        $before = (float) $previous;
        $absolute = $current - $before;

        // Division by zero. There is no percentage change from nothing.
        if ($before === 0.0) {
            return [$absolute, null];
        }

        // A sign flip. The percentage is computable and meaningless.
        if (($current < 0) !== ($before < 0)) {
            return [$absolute, null];
        }

        return [$absolute, $absolute / abs($before)];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'value' => $this->value,
            'previous' => $this->previous,
            'change_absolute' => $this->changeAbsolute,
            // Rounded to four places: the client formats to one or two, and
            // sending sixteen digits of float noise helps nobody.
            'change_pct' => $this->changePercent === null
                ? null
                : round($this->changePercent, 4),
            'favourable' => $this->favourable,
            'format' => $this->format,
            'empty_reason' => $this->emptyReason,
        ];
    }
}
