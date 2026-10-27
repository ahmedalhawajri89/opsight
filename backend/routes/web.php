<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
 * This deployment is an API. It has no pages.
 *
 * What stood here was Laravel's welcome page, and on the public demo it did
 * real harm: the owner opened the API's address, saw a framework's "Let's get
 * started" screen, and concluded the deployment was broken. It was not — the
 * application was running perfectly at its own address — but a door that
 * shows somebody else's furniture is a door that lies about the building.
 *
 * So the root sends a visitor to the application, which is the only thing
 * anyone arriving here by hand actually wants. 302, not 301: the two
 * addresses are a deployment detail and must not be cached into a browser
 * for a year.
 *
 * Without FRONTEND_URL there is nowhere to send them, and the honest answer
 * is the one an API owes a caller: what this is, and where to check it is
 * alive. Not a 404 — this address does exist, and saying it does not would
 * send the next person looking for a mistake that is not there.
 */
Route::get('/', function () {
    $frontend = config('app.frontend_url');

    if (is_string($frontend) && $frontend !== '') {
        return redirect()->away($frontend);
    }

    return response()->json([
        'service' => config('app.name').' API',
        'health' => url('/api/v1/health'),
    ]);
})->name('root');
