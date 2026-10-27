<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| What this deployment says to someone who arrives by hand
|--------------------------------------------------------------------------
|
| Both of these were live on the public demo, and both were invisible from
| the application itself — which always asks for JSON, and so always took the
| branch that worked. They were found by opening the address in a browser,
| which is exactly what the owner did.
|
*/

describe('an unauthenticated request', function (): void {
    it('is refused with 401, whatever it asked to be given back', function (?string $accept): void {
        /*
         * THE BUG THIS EXISTS FOR. There is no `login` route here — signing
         * in is a screen in another application — so Laravel's default
         * answer to a guest who did not ask for JSON was to look one up,
         * fail, and turn a 401 into a 500 with a server-error reference.
         *
         * The dataset is the whole point: with `application/json` this always
         * passed, which is why nothing caught it.
         */
        $headers = $accept === null ? [] : ['Accept' => $accept];

        $this->get('/api/v1/me', $headers)
            ->assertStatus(401)
            ->assertJsonPath('code', 'auth.unauthenticated');
    })->with([
        'asking for JSON, as the application does' => ['application/json'],
        'asking for anything, as a browser does' => ['text/html,application/xhtml+xml,*/*'],
        'asking for nothing, as a probe does' => [null],
    ]);

    it('still lets a signed-in reader through', function (): void {
        // The guard against fixing the refusal by refusing everyone.
        $this->actingAs(User::factory()->role(Role::Owner)->create())
            ->getJson('/api/v1/me')
            ->assertOk();
    });
});

describe('the root of the API', function (): void {
    it('sends a visitor to the application rather than showing a framework', function (): void {
        // What stood here was Laravel's welcome page, and the owner read it
        // as a broken deployment. A door must not show another building's
        // furniture.
        config(['app.frontend_url' => 'https://opsight-demo.vercel.app']);

        $this->get('/')
            ->assertRedirect('https://opsight-demo.vercel.app')
            // 302: which address serves what is a deployment detail, and must
            // not be cached into somebody's browser for a year.
            ->assertStatus(302);
    });

    it('says what it is when there is nowhere to send them', function (): void {
        config(['app.frontend_url' => null]);

        $this->getJson('/')
            ->assertOk()
            ->assertJsonStructure(['service', 'health']);
    });

    it('never serves the framework welcome page', function (): void {
        config(['app.frontend_url' => null]);

        // Named, because this is the exact string the owner saw and the exact
        // string that must never come back.
        expect($this->get('/')->getContent())->not->toContain('Let\'s get started');
    });
});
