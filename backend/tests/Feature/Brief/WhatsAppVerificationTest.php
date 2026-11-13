<?php

declare(strict_types=1);

use App\Domain\Brief\WhatsAppVerification;
use App\Models\User;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/*
|--------------------------------------------------------------------------
| Proving a WhatsApp number (security audit, 2026-11-13)
|--------------------------------------------------------------------------
|
| The brief went to whatever number was typed, so anyone could have this
| installation's WhatsApp number message a stranger every morning.
|
*/

beforeEach(function (): void {
    config(['brief.whatsapp.token' => 'wa-token', 'brief.whatsapp.phone_number_id' => '1234567890']);
    Http::fake(['https://graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.1']]])]);

    $this->user = User::factory()->owner()->create();
    $this->user->forceFill(['brief_channel' => 'whatsapp', 'whatsapp_phone' => '+966501806978'])->save();
});

/** The code in the last message sent to Meta. */
function sentCode(): string
{
    $last = collect(Http::recorded())->last();
    assert(is_array($last));

    return (string) $last[0]->data()['template']['components'][0]['parameters'][0]['text'];
}

it('sends a six-digit code as an authentication template to the saved number', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/me/whatsapp/code')->assertStatus(202);

    Http::assertSent(function (Request $request): bool {
        $template = $request->data()['template'];

        return $request->data()['to'] === '966501806978'
            && $template['name'] === config('brief.whatsapp.verify_template')
            && preg_match('/^\d{6}$/', $template['components'][0]['parameters'][0]['text']) === 1
            && $template['components'][1]['type'] === 'button';
    });
});

it('marks the number proved when the code comes back', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/me/whatsapp/code')->assertStatus(202);

    $this->actingAs($this->user)->postJson('/api/v1/me/whatsapp/verify', ['code' => sentCode()])->assertOk();

    expect($this->user->fresh()->whatsapp_verified_at)->not->toBeNull();
});

it('refuses a wrong code, and throws the code away after five wrong tries', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/me/whatsapp/code')->assertStatus(202);
    $code = sentCode();
    $wrong = $code === '000000' ? '111111' : '000000';

    foreach (range(1, WhatsAppVerification::MAX_ATTEMPTS) as $attempt) {
        $this->actingAs($this->user)->postJson('/api/v1/me/whatsapp/verify', ['code' => $wrong])
            ->assertStatus(422);
    }

    // The right code is no good now: it was discarded with the fifth miss.
    $this->actingAs($this->user)->postJson('/api/v1/me/whatsapp/verify', ['code' => $code])->assertStatus(422);

    expect($this->user->fresh()->whatsapp_verified_at)->toBeNull();
});

it('forgets the proof, and voids a pending code, when the number changes', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/me/whatsapp/code')->assertStatus(202);
    $code = sentCode();

    $this->actingAs($this->user)->patchJson('/api/v1/me/preferences', ['whatsapp_phone' => '+966500000001'])->assertOk();
    $this->actingAs($this->user)->postJson('/api/v1/me/whatsapp/verify', ['code' => $code])->assertStatus(422);

    $this->user->forceFill(['whatsapp_verified_at' => now()])->save();
    $this->actingAs($this->user)->patchJson('/api/v1/me/preferences', ['whatsapp_phone' => '+966500000002'])->assertOk();

    expect($this->user->fresh()->whatsapp_verified_at)->toBeNull();
});

it('sends no brief to a number that was never proved', function (): void {
    $this->actingAs($this->user)->postJson('/api/v1/me/brief/test')
        ->assertStatus(422)
        ->assertJsonPath('message', __('brief.whatsapp_unverified'));

    Http::assertNothingSent();
});

it('says WhatsApp is not set up rather than pretending to send a code', function (): void {
    config(['brief.whatsapp.token' => null]);

    $this->actingAs($this->user)->postJson('/api/v1/me/whatsapp/code')
        ->assertStatus(422)
        ->assertJsonPath('message', __('brief.unavailable_whatsapp'));
});
