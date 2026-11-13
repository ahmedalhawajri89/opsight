<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The email asking someone to confirm their address.
 *
 * In the recipient's language (the sender sets `locale()`), with the product
 * named in the strings for the same reason as the reset email: it is spelt
 * differently in each script. The link is built by EmailVerification.
 */
final class VerifyEmailNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly string $url) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('auth.verify_mail.subject'))
            ->greeting(__('auth.verify_mail.greeting'))
            ->line(__('auth.verify_mail.intro'))
            ->action(__('auth.verify_mail.action'), $this->url)
            ->line(__('auth.verify_mail.expires', ['days' => 3]))
            ->line(__('auth.verify_mail.ignore'))
            ->salutation(__('auth.verify_mail.salutation'));
    }
}
