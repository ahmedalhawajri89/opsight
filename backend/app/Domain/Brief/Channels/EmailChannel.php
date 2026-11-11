<?php

declare(strict_types=1);

namespace App\Domain\Brief\Channels;

use App\Mail\MorningBriefMail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

final class EmailChannel implements BriefChannel
{
    public function name(): string
    {
        return 'email';
    }

    public function available(): bool
    {
        return true;
    }

    public function send(User $user, array $brief, array $text): void
    {
        // Sent now, not queued: the scheduler already runs out of band, and a
        // queued mail would be recorded as delivered before it had been.
        Mail::to($user->email)->send(new MorningBriefMail(
            text: $text,
            name: trim(explode(' ', (string) $user->name)[0]),
            business: (string) $brief['business'],
            rtl: ($user->locale ?? 'en') === 'ar',
            quiet: (bool) $brief['quiet'],
        ));
    }
}
