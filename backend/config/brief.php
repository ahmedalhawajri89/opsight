<?php

declare(strict_types=1);

/*
 * The morning brief (product track, phase C).
 *
 * Email works wherever mail does. WhatsApp is inert until all three
 * WHATSAPP_* values are set — the same rule as Zid and the assistant: no
 * credentials, no channel, and the settings screen says so.
 */
return [

    /** The hour, in each business's own timezone, the brief goes out. */
    'hour' => (int) env('BRIEF_HOUR', 8),

    'whatsapp' => [
        // From Meta's WhatsApp Business Platform (Cloud API).
        'token' => env('WHATSAPP_TOKEN'),
        'phone_number_id' => env('WHATSAPP_PHONE_NUMBER_ID'),

        /*
         * A business-initiated message outside a 24-hour conversation must be
         * a template Meta has approved. Its exact text, with the five
         * positional parameters this sends, is in docs/SETUP.md.
         */
        'template' => env('WHATSAPP_BRIEF_TEMPLATE', 'baydar_morning_brief'),

        // An authentication template carrying a one-time code (docs/SETUP.md).
        'verify_template' => env('WHATSAPP_VERIFY_TEMPLATE', 'baydar_verify'),

        'api_base' => env('WHATSAPP_API_BASE', 'https://graph.facebook.com/v21.0'),
    ],
];
