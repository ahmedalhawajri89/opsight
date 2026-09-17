<?php

declare(strict_types=1);

namespace App\Domain\Insights;

/**
 * One finding.
 *
 * An insight is a SENTENCE ABOUT A NUMBER, plus the route back to the number.
 * Both halves are required. A dashboard line reading "Gross margin fell" that
 * a manager cannot click through to verify is an assertion they have to take
 * on trust, and the first time it turns out to be an artefact of a partial
 * period they stop reading the feed entirely.
 *
 * So every insight carries `link`: the exact analytics query that produced it.
 * The claim and the evidence ship together.
 */
final readonly class Insight
{
    /**
     * @param  string  $id  stable rule identifier, e.g. `margin_decline`
     * @param  string  $severity  one of SEVERITIES
     * @param  array<string, mixed>  $link  query parameters for the analytics screen
     * @param  array<string, mixed>  $values  the figures quoted in the message, unformatted
     */
    public function __construct(
        public string $id,
        public string $severity,
        public string $title,
        public string $message,
        public array $link = [],
        public array $values = [],
    ) {}

    /**
     * Deliberately NOT a red/amber/green scale.
     *
     * `action` and `opportunity` are not degrees of badness — they are
     * different things to do. A colour ramp would force "eleven products need
     * reordering" to be ranked against "margin fell 4 points", which are not
     * comparable, and whichever one lost the ranking would be styled as less
     * important than it is.
     */
    public const SEVERITIES = ['warning', 'action', 'positive', 'opportunity', 'data_quality'];

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'severity' => $this->severity,
            'title' => $this->title,
            'message' => $this->message,
            'link' => $this->link,
            'values' => $this->values,
        ];
    }
}
