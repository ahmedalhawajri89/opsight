<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Authentication Language Lines
    |--------------------------------------------------------------------------
    |
    | The following language lines are used during authentication for various
    | messages that we need to display to the user. You are free to modify
    | these language lines according to your application's requirements.
    |
    */

    'failed' => 'These credentials do not match our records.',
    'password' => 'The provided password is incorrect.',
    'throttle' => 'Too many login attempts. Please try again in :seconds seconds.',

    'google_failed' => 'Google could not confirm that sign-in. Try again, or sign in with your password.',
    'google_no_account' => 'No active Baydar account uses this Google address. Sign in with your password, or ask your owner to add this address.',
    'google_unverified' => 'This address has a Baydar account that was never confirmed. Open the link in the confirmation email, or reset the password from "Forgot password", then sign in with Google.',

    /*
     * A forgotten password. `reset_link_sent` is the same sentence whether or
     * not the address has an account (PasswordResetController).
     */
    'reset_link_sent' => 'If an account uses that address, a link to choose a new password is on its way. It works for an hour.',
    'reset_invalid' => 'This link has expired or has already been used. Ask for a new one.',
    'reset_done' => 'Your password is changed. Sign in with the new one.',
    'reset_mail' => [
        'subject' => 'Choose a new Baydar password',
        'greeting' => 'Hello,',
        'intro' => 'Someone asked to reset the password for this account. If it was you, choose a new one here.',
        'action' => 'Choose a new password',
        'expires' => 'The link works for :minutes minutes, and only once.',
        'ignore' => 'If you did not ask, ignore this email: your password stays as it is.',
        'salutation' => 'Baydar',
    ],

    'verify_invalid' => 'This confirmation link is not valid any more. Sign in and ask for a new one.',
    'verify_done' => 'Your email address is confirmed.',
    'verify_sent' => 'A confirmation link is on its way to your email address.',
    'verify_mail' => [
        'subject' => 'Confirm your email address for Baydar',
        'greeting' => 'Hello,',
        'intro' => 'Please confirm that this address is yours, so that Baydar can send your morning brief here and you can sign in with Google.',
        'action' => 'Confirm my email address',
        'expires' => 'The link works for :days days.',
        'ignore' => 'If you did not open a Baydar account, ignore this email: nothing will be sent to you.',
        'salutation' => 'Baydar',
    ],

];
