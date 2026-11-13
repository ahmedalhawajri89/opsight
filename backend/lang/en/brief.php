<?php

declare(strict_types=1);

/*
 * The morning brief. Every value arrives already formatted in the reader's
 * digits and currency; these sentences only arrange them.
 */
return [
    'subject' => ':business — your morning brief for :date',
    'greeting' => 'Good morning, :name.',
    'headline' => ':date: :revenue in sales from :orders orders.',
    'headline_none' => 'No sales were recorded on :date.',
    'up' => 'That is :pct more than the same day last week.',
    'down' => 'That is :pct less than the same day last week.',
    'gross_profit' => 'Gross profit: :value',
    'month_to_date' => 'This month so far: :value',
    'receivables' => 'Owed to you by customers: :value',
    'stock' => 'About to run out: :items.',
    'actions' => 'Worth a look today',
    'open' => 'Open Baydar',
    'footer' => 'You are receiving this because you turned on the morning brief. Turn it off in Baydar, under Morning brief.',
    'quiet' => 'A quiet day: nothing sold and nothing needs your attention.',
    'unavailable_whatsapp' => 'WhatsApp is not set up on this installation yet.',
    'email_unverified' => 'Confirm your email address first: the brief is only sent to an address you have confirmed.',
    'no_phone' => 'Add a WhatsApp number first.',
    'sent_test' => 'A test brief is on its way.',
    'whatsapp_refused' => 'WhatsApp did not accept the message. Check the number, or try email.',
    'failed' => 'The brief could not be sent. Try again in a few minutes.',
];
