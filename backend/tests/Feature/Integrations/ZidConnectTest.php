<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Integrations\Zid\ZidWebhooks;
use App\Jobs\ImportStoreHistory;
use App\Models\Business;
use App\Models\Integration;
use App\Models\User;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\RateLimiter;

/*
|--------------------------------------------------------------------------
| Connecting a Zid store (ADR-037)
|--------------------------------------------------------------------------
|
| Zid runs a standard OAuth redirect and hands back our own `state`, so a
| store is bound to the business that asked for it at the moment it
| connects. These tests are about what that buys over claiming a Salla store
| by its id: a state is one use, short-lived, and good only in the session
| that started it; and a store cannot be taken from another business.
|
| Zid is faked at the HTTP boundary with the shapes its Authorization and
| Manager Profile documentation describe.
|
*/

beforeEach(function (): void {
    RateLimiter::clear('integration-claim');
    Queue::fake();

    config(['integrations.zid' => array_merge((array) config('integrations.zid'), [
        'client_id' => 'zid-client',
        'client_secret' => 'zid-secret',
        'redirect_uri' => 'https://app.test/settings/integrations/zid/callback',
    ])]);

    $this->owner = User::factory()->role(Role::Owner)->create();
});

/** Fakes Zid's token, profile and webhook endpoints for one store. */
function fakeZid(string $storeId = '98765'): void
{
    Http::fake([
        'https://oauth.zid.sa/oauth/token' => Http::response([
            'token_type' => 'Bearer',
            'expires_in' => 94608000,
            'authorization' => 'the-authorization-jwt',
            'access_token' => 'the-manager-token',
            'refresh_token' => 'the-refresh-token',
        ]),
        'https://api.zid.sa/v1/managers/account/profile' => Http::response([
            'user' => ['store' => ['id' => (int) $storeId, 'title' => 'Sara\'s Brows']],
        ]),
        'https://api.zid.sa/v1/managers/webhooks' => Http::response(['status' => 'object', 'id' => 1]),
    ]);
}

/** Starts the flow as the given user and returns the state Zid would hand back. */
function beginZid(User $user): string
{
    $url = test()->actingAs($user)->getJson('/api/v1/integrations/zid/authorize')
        ->assertOk()
        ->json('data.url');

    parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

    return $query['state'];
}

it('sends the owner to Zid\'s consent screen with our client and a state', function (): void {
    $url = $this->actingAs($this->owner)->getJson('/api/v1/integrations/zid/authorize')
        ->assertOk()
        ->json('data.url');

    parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

    expect($url)->toStartWith('https://oauth.zid.sa/oauth/authorize?')
        ->and($query['client_id'])->toBe('zid-client')
        ->and($query['response_type'])->toBe('code')
        ->and($query['redirect_uri'])->toBe('https://app.test/settings/integrations/zid/callback')
        ->and(strlen($query['state']))->toBeGreaterThanOrEqual(40);
});

it('connects the store to the business that started the flow', function (): void {
    fakeZid();
    $state = beginZid($this->owner);

    $this->actingAs($this->owner)
        ->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state])
        ->assertCreated()
        ->assertJsonPath('data.provider', 'zid')
        ->assertJsonPath('data.store_id', '98765')
        ->assertJsonPath('data.can_refresh', true);

    $integration = Integration::query()->where('provider', 'zid')->sole();

    expect($integration->authorization_token)->toBe('the-authorization-jwt')
        ->and($integration->access_token)->toBe('the-manager-token')
        ->and($integration->refresh_token_expires_at?->isFuture())->toBeTrue();

    // A year of history is fetched straight after, not left for someone to
    // remember to run.
    Queue::assertPushed(ImportStoreHistory::class, fn ($job): bool => $job->integrationId === $integration->id);
});

it('stores both tokens encrypted, and never returns either', function (): void {
    fakeZid();
    $state = beginZid($this->owner);

    $body = $this->actingAs($this->owner)
        ->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state])
        ->getContent();

    // Read from the raw column: through the model the cast would decrypt and
    // this would prove nothing.
    $raw = DB::table('integrations')->where('provider', 'zid')->first();

    expect($raw->authorization_token)->not->toContain('the-authorization-jwt')
        ->and($raw->access_token)->not->toContain('the-manager-token')
        ->and($body)->not->toContain('the-authorization-jwt')
        ->and($body)->not->toContain('the-manager-token')
        ->and($body)->not->toContain('the-refresh-token');
});

it('sends the code and our secret in the body, never the URL', function (): void {
    fakeZid();
    $state = beginZid($this->owner);

    $this->actingAs($this->owner)->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state]);

    Http::assertSent(fn (Request $request): bool => $request->url() === 'https://oauth.zid.sa/oauth/token'
        && $request['grant_type'] === 'authorization_code'
        && $request['code'] === 'a-code'
        && $request['client_secret'] === 'zid-secret');
});

it('refuses a state presented twice', function (): void {
    fakeZid();
    $state = beginZid($this->owner);

    $this->actingAs($this->owner)
        ->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state])
        ->assertCreated();

    $this->actingAs($this->owner)
        ->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state])
        ->assertStatus(422)
        ->assertJsonPath('code', 'integration.state_invalid');
});

it('refuses a state that another owner started', function (): void {
    /*
     * A state that leaked from one browser is useless in another session.
     * Same business even — it is bound to the person, not just the company.
     */
    fakeZid();
    $state = beginZid($this->owner);
    $colleague = User::factory()->role(Role::Owner)->create();

    $this->actingAs($colleague)
        ->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state])
        ->assertStatus(422);

    expect(Integration::query()->where('provider', 'zid')->exists())->toBeFalse();
    Http::assertNothingSent();
});

it('refuses a state it never issued, without asking Zid anything', function (): void {
    fakeZid();

    $this->actingAs($this->owner)
        ->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => str_repeat('x', 48)])
        ->assertStatus(422);

    Http::assertNothingSent();
});

it('will not connect a store that is already another business\'s', function (): void {
    $other = Business::factory()->create();

    CurrentBusiness::get()->run($other->id, fn () => Integration::query()->create([
        'provider' => 'zid', 'external_account_id' => '98765', 'status' => Integration::STATUS_CONNECTED,
    ]));

    fakeZid();
    $state = beginZid($this->owner);

    $this->actingAs($this->owner)
        ->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state])
        ->assertStatus(409)
        ->assertJsonPath('code', 'integration.taken');

    $rows = Integration::query()->withoutGlobalScope(BusinessScope::class)->where('provider', 'zid')->get();

    expect($rows)->toHaveCount(1)
        ->and($rows->first()->business_id)->toBe($other->id);
});

it('replaces the tokens in place when the same store connects again', function (): void {
    fakeZid();

    foreach ([1, 2] as $_) {
        $state = beginZid($this->owner);
        $this->actingAs($this->owner)->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state])
            ->assertCreated();
    }

    expect(Integration::query()->where('provider', 'zid')->count())->toBe(1);
});

it('lets only someone who may connect stores start or finish the flow', function (string $role): void {
    $user = User::factory()->role(Role::from($role))->create();

    $this->actingAs($user)->getJson('/api/v1/integrations/zid/authorize')->assertForbidden();
    $this->actingAs($user)->postJson('/api/v1/integrations/zid/callback', ['code' => 'c', 'state' => 's'])->assertForbidden();
})->with(['manager', 'analyst', 'staff']);

it('says so plainly when this installation has no Zid app', function (): void {
    config(['integrations.zid.client_id' => null]);

    $this->actingAs($this->owner)
        ->getJson('/api/v1/integrations/zid/authorize')
        ->assertStatus(503)
        ->assertJsonPath('code', 'integration.unavailable');
});

it('registers the store\'s webhooks with the credentials Zid will send back', function (): void {
    config(['integrations.secrets.zid' => 'webhook-password']);
    fakeZid();
    $state = beginZid($this->owner);

    $this->actingAs($this->owner)->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state])
        ->assertCreated();

    $subscriptions = Http::recorded(fn (Request $request): bool => str_ends_with($request->url(), '/managers/webhooks'));

    expect($subscriptions)->toHaveCount(count(ZidWebhooks::EVENTS));

    [$request] = $subscriptions->first();

    expect($request['username'])->toBe('baydar')
        ->and($request['password'])->toBe('webhook-password')
        ->and($request['target_url'])->toEndWith('/api/v1/webhooks/zid')
        ->and($request->header('X-Manager-Token')[0])->toBe('the-manager-token')
        ->and($request->header('Authorization')[0])->toBe('Bearer the-authorization-jwt');
});

it('keeps the connection, with the reason on it, when Zid will not take the webhooks', function (): void {
    config(['integrations.secrets.zid' => 'webhook-password']);

    Http::fake([
        'https://oauth.zid.sa/oauth/token' => Http::response([
            'expires_in' => 94608000, 'authorization' => 'a', 'access_token' => 'm', 'refresh_token' => 'r',
        ]),
        'https://api.zid.sa/v1/managers/account/profile' => Http::response(['user' => ['store' => ['id' => 98765]]]),
        'https://api.zid.sa/v1/managers/webhooks' => Http::response(['message' => 'scope missing'], 403),
    ]);

    $state = beginZid($this->owner);

    $this->actingAs($this->owner)->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state])
        ->assertCreated();

    $integration = Integration::query()->where('provider', 'zid')->sole();

    expect($integration->status)->toBe(Integration::STATUS_CONNECTED)
        ->and($integration->last_error)->toContain('would not send live updates');
});

it('registers nothing without a webhook secret, rather than webhooks that would 404', function (): void {
    fakeZid();
    $state = beginZid($this->owner);

    $this->actingAs($this->owner)->postJson('/api/v1/integrations/zid/callback', ['code' => 'a-code', 'state' => $state]);

    Http::assertNotSent(fn (Request $request): bool => str_ends_with($request->url(), '/managers/webhooks'));
});

it('tells the owner when Zid refuses the code', function (): void {
    Http::fake(['https://oauth.zid.sa/oauth/token' => Http::response(['message' => 'The authorization code has expired'], 400)]);
    $state = beginZid($this->owner);

    $this->actingAs($this->owner)
        ->postJson('/api/v1/integrations/zid/callback', ['code' => 'stale', 'state' => $state])
        ->assertStatus(422)
        ->assertJsonPath('code', 'integration.refused');

    expect(Integration::query()->where('provider', 'zid')->exists())->toBeFalse();
});
