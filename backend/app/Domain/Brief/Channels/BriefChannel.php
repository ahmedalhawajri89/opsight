<?php

declare(strict_types=1);

namespace App\Domain\Brief\Channels;

use App\Models\User;

/** Somewhere a morning brief can be delivered. */
interface BriefChannel
{
    /** 'email', 'whatsapp' — what `users.brief_channel` holds. */
    public function name(): string;

    /** Whether this installation can send on it at all. */
    public function available(): bool;

    /**
     * Sends one brief. Throws with a reason a person can read; SendBrief
     * records it against the day.
     *
     * @param  array<string, mixed>  $brief  MorningBrief::for()
     * @param  array<string, mixed>  $text  BriefText::render()
     */
    public function send(User $user, array $brief, array $text): void;
}
