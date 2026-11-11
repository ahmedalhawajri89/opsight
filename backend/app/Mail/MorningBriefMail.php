<?php

declare(strict_types=1);

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * The morning brief, as email. Built from text already rendered in the
 * reader's language (BriefText); this only lays it out.
 */
final class MorningBriefMail extends Mailable
{
    use Queueable;

    /**
     * @param  array{subject: string, date: string, headline: string, lines: list<string>, stock: string|null, actions: list<string>}  $text
     */
    public function __construct(
        public readonly array $text,
        public readonly string $name,
        public readonly string $business,
        public readonly bool $rtl,
        public readonly bool $quiet,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->text['subject']);
    }

    public function content(): Content
    {
        return new Content(view: 'mail.brief', with: [
            'locale' => $this->rtl ? 'ar' : 'en',
            'url' => rtrim((string) config('app.frontend_url'), '/').'/dashboard',
        ]);
    }
}
