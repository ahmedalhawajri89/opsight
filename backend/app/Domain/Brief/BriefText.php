<?php

declare(strict_types=1);

namespace App\Domain\Brief;

use App\Support\Localization\Localizer;
use Carbon\CarbonImmutable;

/**
 * A brief's figures as sentences, in the reader's language and digits.
 *
 * Run AFTER the reader's locale is applied (SendBrief does it), so
 * `__()` and the Localizer speak their language: an owner reading Arabic
 * with Arabic-Indic digits gets both, and a manager reading English gets
 * neither.
 *
 * Every sentence is a whole line with no line breaks inside it, because
 * WhatsApp's template parameters may not contain one.
 */
final class BriefText
{
    public function __construct(private readonly Localizer $localizer) {}

    /**
     * @param  array<string, mixed>  $brief  MorningBrief::for()
     * @return array{subject: string, date: string, headline: string, lines: list<string>, stock: string|null, actions: list<string>}
     */
    public function render(array $brief): array
    {
        /*
         * The day's number through the Localizer, not Carbon: Carbon writes
         * Western digits whatever the locale, and an owner who chose
         * Arabic-Indic digits would read "١٢٣ د.ب" beside "10 نوفمبر".
         */
        $day = CarbonImmutable::parse($brief['date'])->locale($this->localizer->locale());
        $date = $day->translatedFormat('l').' '.$this->localizer->number($day->day).' '.$day->translatedFormat('F');
        $money = fn (string $value): string => $this->localizer->money($value, $brief['currency'], $brief['decimals']);

        if ($brief['orders'] === 0) {
            $headline = __('brief.headline_none', ['date' => $date]);
        } else {
            $headline = __('brief.headline', [
                'date' => $date,
                'revenue' => $money($brief['revenue']),
                'orders' => $this->localizer->number($brief['orders']),
            ]);

            if ($brief['change'] !== null) {
                $headline .= ' '.__($brief['change'] >= 0 ? 'brief.up' : 'brief.down', [
                    'pct' => $this->localizer->percent(abs($brief['change']), 0),
                ]);
            }
        }

        $lines = [];

        if ($brief['gross_profit'] !== null && $brief['orders'] > 0) {
            $lines[] = __('brief.gross_profit', ['value' => $money($brief['gross_profit'])]);
        }

        $lines[] = __('brief.month_to_date', ['value' => $money($brief['month_to_date'])]);

        if ($brief['receivables'] !== null && bccomp($brief['receivables'], '0', 4) > 0) {
            $lines[] = __('brief.receivables', ['value' => $money($brief['receivables'])]);
        }

        return [
            'subject' => __('brief.subject', ['business' => $brief['business'], 'date' => $date]),
            'date' => $date,
            'headline' => $headline,
            'lines' => $lines,
            'stock' => $brief['stock'] === [] ? null : __('brief.stock', ['items' => implode('، ', $brief['stock'])]),
            // Title AND sentence: a title alone ("Revenue concentration") says
            // what kind of finding it is, not what it found.
            'actions' => array_map(static fn (array $a): string => self::oneLine($a['title'].': '.$a['message']), $brief['actions']),
        ];
    }

    /** Any run of whitespace, line breaks included, as one space. */
    public static function oneLine(string $text): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $text));
    }
}
