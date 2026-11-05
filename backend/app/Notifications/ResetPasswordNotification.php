<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * The email carrying a link to choose a new password.
 *
 * Laravel's own notification is English only and links to a route this API
 * does not have. This one is written in the recipient's language (the sender
 * sets `locale()` from the account, User::sendPasswordResetNotification) and
 * links to the frontend's /reset-password screen, which holds the form.
 *
 * The product's name is written into the strings rather than read from
 * `app.name`: it is spelt differently in each script (Baydar, بيدر), and
 * `app.name` is one value.
 *
 * The link names the address as well as the token, because the token table is
 * keyed by address: the form has to send both back.
 */
final class ResetPasswordNotification extends ResetPassword
{
    public function toMail($notifiable): MailMessage
    {
        $minutes = (int) config('auth.passwords.users.expire');

        return (new MailMessage)
            ->subject(__('auth.reset_mail.subject'))
            ->greeting(__('auth.reset_mail.greeting'))
            ->line(__('auth.reset_mail.intro'))
            ->action(__('auth.reset_mail.action'), $this->resetUrl($notifiable))
            ->line(__('auth.reset_mail.expires', ['minutes' => $minutes]))
            ->line(__('auth.reset_mail.ignore'))
            ->salutation(__('auth.reset_mail.salutation'));
    }

    protected function resetUrl($notifiable): string
    {
        return rtrim((string) config('app.frontend_url'), '/').'/reset-password?'.http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ]);
    }
}
