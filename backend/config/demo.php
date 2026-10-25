<?php

declare(strict_types=1);

/*
 * The public demo (docs/DEPLOYMENT.md).
 *
 * Off everywhere except the one installation a visitor is sent to try. When it
 * is on, that installation seeds the demo accounts, the second business and
 * three years of history, rebuilds them every night (`demo:reset`), and keeps
 * the accounts themselves out of a visitor's reach. Everything else a role may
 * do, a visitor may do: the data is theirs to change until the reset.
 */
return [

    'enabled' => (bool) env('DEMO_MODE', false),

    /*
     * The accounts the sign-in page offers. In the demo nobody may change their
     * password, email, role or status: one visitor could otherwise lock every
     * later one out until the night's reset. Must match the seeders.
     */
    'accounts' => [
        'owner@opsight.test',
        'manager@opsight.test',
        'analyst@opsight.test',
        'staff@opsight.test',
        'owner@alnoor.test',
    ],

];
