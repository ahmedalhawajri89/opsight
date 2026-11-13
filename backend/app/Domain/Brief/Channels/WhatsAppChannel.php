<?php

declare(strict_types=1);

namespace App\Domain\Brief\Channels;

use App\Domain\Brief\BriefProblem;
use App\Domain\Brief\BriefText;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * The morning brief over WhatsApp, through Meta's Cloud API.
 *
 * A TEMPLATE, BECAUSE IT MUST BE. A message a business starts outside a
 * 24-hour conversation has to be a template Meta approved in advance, with
 * the variable parts sent as positional parameters. This sends five; the
 * template's exact wording is in docs/SETUP.md, and it has to be approved
 * in both Arabic and English under the same name.
 *
 * EACH PARAMETER IS ONE LINE. Template parameters may not contain line
 * breaks or long runs of spaces, so every value goes through
 * BriefText::oneLine and is cut to a length that fits the template's own
 * limit.
 *
 * Not seen working against a live Meta account: none exists for this
 * installation yet. The request shape is Meta's documented one.
 */
final class WhatsAppChannel implements BriefChannel
{
    /** Keeps five parameters well inside a template body's 1,024 characters. */
    private const PARAM_MAX = 180;

    public function name(): string
    {
        return 'whatsapp';
    }

    public function available(): bool
    {
        return filled(config('brief.whatsapp.token')) && filled(config('brief.whatsapp.phone_number_id'));
    }

    public function send(User $user, array $brief, array $text): void
    {
        if (! $this->available()) {
            throw new BriefProblem(__('brief.unavailable_whatsapp'));
        }

        $phone = (string) $user->whatsapp_phone;

        if ($phone === '') {
            throw new BriefProblem(__('brief.no_phone'));
        }

        $parameters = array_map(
            fn (string $value): array => ['type' => 'text', 'text' => $this->param($value)],
            [
                trim(explode(' ', (string) $user->name)[0]) ?: (string) $brief['business'],
                $text['headline'],
                implode(' ', $text['lines']),
                $text['stock'] ?? '—',
                $text['actions'] === [] ? '—' : implode(' · ', $text['actions']),
            ],
        );

        $this->post($phone, (string) config('brief.whatsapp.template'), $user->locale ?? 'en', [
            ['type' => 'body', 'parameters' => $parameters],
        ]);
    }

    /**
     * A one-time code proving a number is the reader's (security audit,
     * 2026-11-13). Meta's authentication category: the code in the body, and
     * again behind the template's "copy code" button. Its text is Meta's own
     * fixed wording for that category; the template name is in docs/SETUP.md.
     */
    public function sendCode(string $phone, string $code, string $locale): void
    {
        if (! $this->available()) {
            throw new BriefProblem(__('brief.unavailable_whatsapp'));
        }

        $this->post($phone, (string) config('brief.whatsapp.verify_template'), $locale, [
            ['type' => 'body', 'parameters' => [['type' => 'text', 'text' => $code]]],
            ['type' => 'button', 'sub_type' => 'url', 'index' => '0', 'parameters' => [['type' => 'text', 'text' => $code]]],
        ]);
    }

    /**
     * @param  list<array<string, mixed>>  $components
     */
    private function post(string $phone, string $template, string $locale, array $components): void
    {
        $response = Http::withToken((string) config('brief.whatsapp.token'))
            ->acceptJson()
            ->timeout(15)
            ->post(rtrim((string) config('brief.whatsapp.api_base'), '/').'/'.config('brief.whatsapp.phone_number_id').'/messages', [
                'messaging_product' => 'whatsapp',
                // Meta wants the number without its plus.
                'to' => ltrim($phone, '+'),
                'type' => 'template',
                'template' => [
                    'name' => $template,
                    'language' => ['code' => $locale === 'ar' ? 'ar' : 'en'],
                    'components' => $components,
                ],
            ]);

        if (! $response->successful()) {
            $reason = $response->json('error.message');

            // Meta's own words are for the logs; the reader gets ours.
            report(new RuntimeException(is_string($reason) && $reason !== '' ? $reason : "WhatsApp answered {$response->status()}."));

            throw new BriefProblem(__('brief.whatsapp_refused'));
        }
    }

    private function param(string $value): string
    {
        $value = BriefText::oneLine($value);

        return mb_strlen($value) > self::PARAM_MAX ? mb_substr($value, 0, self::PARAM_MAX - 1).'…' : $value;
    }
}
