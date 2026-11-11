<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Brief\BriefText;
use App\Domain\Brief\MorningBrief;
use App\Domain\Brief\SendBrief;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\Period;
use App\Mail\MorningBriefMail;
use App\Models\BriefDelivery;
use App\Models\Product;
use App\Models\User;
use App\Support\Localization\Localizer;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Support\MetricFixture;

/*
|--------------------------------------------------------------------------
| The morning brief (product track, phase C)
|--------------------------------------------------------------------------
|
| Every figure computed, none worded by a model; the role decides what is
| in it; once a day, enforced by the database; in the reader's language.
|
*/

beforeEach(function (): void {
    RateLimiter::clear('brief-test');
    $this->owner = User::factory()->role(Role::Owner)->create(['name' => 'Ahmed Al Hawajri', 'locale' => 'en']);
});

/** The morning after the fixture's busiest day. */
function briefMorning(): CarbonImmutable
{
    MetricFixture::build();

    return CarbonImmutable::parse('2026-08-21 08:00:00', 'Asia/Bahrain');
}

/*
|--------------------------------------------------------------------------
| What is in it
|--------------------------------------------------------------------------
*/

it('reports yesterday through the dashboard\'s own functions', function (): void {
    $now = briefMorning();
    $brief = app(MorningBrief::class)->for($this->owner, $now);
    $metrics = app(MetricCalculator::class);
    $day = Period::between('2026-08-20', '2026-08-20');

    expect($brief['date'])->toBe('2026-08-20')
        ->and($brief['revenue'])->toBe($metrics->netRevenue($day))
        ->and($brief['orders'])->toBe($metrics->ordersCount($day))
        ->and($brief['month_to_date'])->toBe($metrics->netRevenue(Period::between('2026-08-01', '2026-08-20')));
});

it('compares with the same weekday last week, not the day before', function (): void {
    /*
     * Monday against Sunday compares a working day with a weekend in most of
     * the Gulf. Thursday the 20th is measured against Thursday the 13th.
     */
    $brief = app(MorningBrief::class)->for($this->owner, briefMorning());

    expect($brief['revenue_last_week'])->toBe(app(MetricCalculator::class)->netRevenue(Period::between('2026-08-13', '2026-08-13')));
});

it('leaves out what the role may not see', function (): void {
    briefMorning();
    $staff = User::factory()->role(Role::Staff)->create();

    $brief = app(MorningBrief::class)->for($staff, CarbonImmutable::parse('2026-08-21 08:00', 'Asia/Bahrain'));
    $owners = app(MorningBrief::class)->for($this->owner, CarbonImmutable::parse('2026-08-21 08:00', 'Asia/Bahrain'));

    expect($brief['gross_profit'])->toBeNull()
        ->and($brief['receivables'])->toBeNull()
        ->and($owners['gross_profit'])->not->toBeNull()
        ->and($owners['receivables'])->not->toBeNull();
});

it('names what is about to run out', function (): void {
    Product::factory()->withStock(1)->create(['name' => 'Whiteboard', 'sku' => 'WB-1']);

    $brief = app(MorningBrief::class)->for($this->owner);

    expect($brief['stock'])->toContain('Whiteboard');
});

it('writes a quiet day as one line, not a page of zeros', function (): void {
    expect(app(MorningBrief::class)->for($this->owner)['quiet'])->toBeTrue();
});

/*
|--------------------------------------------------------------------------
| How it reads
|--------------------------------------------------------------------------
*/

it('speaks the reader\'s language, digits and currency', function (): void {
    $this->owner->forceFill(['locale' => 'ar', 'numerals' => 'arab'])->save();

    $text = app(SendBrief::class)->preview($this->owner, briefMorning())['text'];

    expect($text['subject'])->toContain('موجزك الصباحي')
        // The day of the month in Arabic-Indic digits too, not only the money.
        ->and($text['date'])->toContain('٢٠')
        ->and(implode(' ', $text['lines']))->toContain('د.ب')->not->toContain('BHD')
        ->and(implode(' ', $text['lines']))->not->toContain('..');
});

it('puts the sender\'s language back after composing for someone else', function (): void {
    /*
     * The scheduler sends to many people in one process. One owner's Arabic
     * must not leak into the next manager's English.
     */
    App::setLocale('en');
    app(Localizer::class)->use('en', 'latn');
    $this->owner->forceFill(['locale' => 'ar', 'numerals' => 'arab'])->save();

    app(SendBrief::class)->preview($this->owner);

    expect(App::getLocale())->toBe('en')
        ->and(app(Localizer::class)->locale())->toBe('en')
        ->and(app(Localizer::class)->numerals())->toBe('latn');
});

it('never puts a line break inside a sentence', function (): void {
    expect(BriefText::oneLine("Two\nlines   and\ttabs"))->toBe('Two lines and tabs');
});

/*
|--------------------------------------------------------------------------
| Once a day
|--------------------------------------------------------------------------
*/

it('sends once a day however many times the scheduler runs', function (): void {
    Mail::fake();
    $send = app(SendBrief::class);

    expect($send->daily($this->owner))->toBe('sent')
        ->and($send->daily($this->owner))->toBeNull();

    Mail::assertSent(MorningBriefMail::class, 1);
    expect(BriefDelivery::query()->where('user_id', $this->owner->id)->count())->toBe(1);
});

it('keeps a failure with its reason, rather than retrying into a flood', function (): void {
    $this->owner->forceFill(['brief_channel' => 'whatsapp'])->save();  // not configured here

    expect(app(SendBrief::class)->daily($this->owner))->toBe('failed');

    $delivery = BriefDelivery::query()->where('user_id', $this->owner->id)->sole();

    expect($delivery->error)->toContain('not set up');
});

it('does not spend tomorrow\'s brief on a test send', function (): void {
    Mail::fake();

    app(SendBrief::class)->test($this->owner);

    Mail::assertSent(MorningBriefMail::class, 1);
    expect(BriefDelivery::query()->count())->toBe(0);
});

it('sends at the business\'s morning hour, only to those who turned it on', function (): void {
    Mail::fake();
    config(['brief.hour' => 8]);
    $this->owner->forceFill(['morning_brief' => true])->save();
    User::factory()->role(Role::Manager)->create(['morning_brief' => false]);
    User::factory()->role(Role::Staff)->create(['morning_brief' => false, 'is_active' => true]);
    // Opted in, but switched off by the owner: an inactive account gets nothing.
    User::factory()->role(Role::Analyst)->create(['morning_brief' => true, 'is_active' => false]);

    $this->travelTo(CarbonImmutable::parse('2026-11-11 07:30', 'Asia/Bahrain'));
    $this->artisan('opsight:brief:send')->assertSuccessful();
    Mail::assertNothingSent();

    $this->travelTo(CarbonImmutable::parse('2026-11-11 08:05', 'Asia/Bahrain'));
    $this->artisan('opsight:brief:send')->expectsOutputToContain('1 sent')->assertSuccessful();

    Mail::assertSent(MorningBriefMail::class, fn (MorningBriefMail $mail): bool => $mail->hasTo($this->owner->email));
    Mail::assertSent(MorningBriefMail::class, 1);
});

/*
|--------------------------------------------------------------------------
| WhatsApp
|--------------------------------------------------------------------------
*/

it('sends WhatsApp as an approved template, one line per parameter', function (): void {
    config(['brief.whatsapp.token' => 'wa-token', 'brief.whatsapp.phone_number_id' => '1234567890']);
    Http::fake(['https://graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.1']]])]);

    $this->owner->forceFill(['brief_channel' => 'whatsapp', 'whatsapp_phone' => '+966501806978', 'locale' => 'ar'])->save();
    Product::factory()->withStock(1)->create(['name' => "Board\nwith a break", 'sku' => 'WB-1']);

    app(SendBrief::class)->test($this->owner);

    Http::assertSent(function (Request $request): bool {
        $parameters = $request['template']['components'][0]['parameters'];

        return $request->url() === 'https://graph.facebook.com/v21.0/1234567890/messages'
            && $request->hasHeader('Authorization', 'Bearer wa-token')
            && $request['type'] === 'template'
            && $request['to'] === '966501806978'
            && $request['template']['language']['code'] === 'ar'
            && count($parameters) === 5
            && collect($parameters)->every(fn (array $p): bool => ! str_contains($p['text'], "\n"));
    });
});

it('says WhatsApp is not set up rather than pretending to send', function (): void {
    $this->owner->forceFill(['brief_channel' => 'whatsapp', 'whatsapp_phone' => '+966501806978'])->save();

    expect(fn () => app(SendBrief::class)->test($this->owner))->toThrow(RuntimeException::class, 'not set up');
});

/*
|--------------------------------------------------------------------------
| The settings, over HTTP
|--------------------------------------------------------------------------
*/

it('shows today\'s brief as a preview, with the reader\'s settings', function (): void {
    $this->actingAs($this->owner)->getJson('/api/v1/me/brief')
        ->assertOk()
        ->assertJsonPath('data.enabled', false)
        ->assertJsonPath('data.channel', 'email')
        ->assertJsonPath('data.whatsapp_available', false)
        ->assertJsonStructure(['data' => ['preview' => ['subject', 'headline', 'lines', 'actions'], 'recent']]);
});

it('sends the preview figures raw, shaped by the reader role', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($this->owner)->getJson('/api/v1/me/brief')
        ->assertOk()
        ->assertJsonStructure(['data' => ['preview' => ['figures' => ['revenue', 'change', 'orders', 'gross_profit', 'month_to_date', 'receivables', 'stock', 'actions']]]]);

    $this->actingAs($staff)->getJson('/api/v1/me/brief')
        ->assertOk()
        ->assertJsonPath('data.preview.figures.gross_profit', null)
        ->assertJsonPath('data.preview.figures.receivables', null);
});

it('turns the brief on and stores a WhatsApp number in international form', function (): void {
    $this->actingAs($this->owner)->patchJson('/api/v1/me/preferences', [
        'morning_brief' => true,
        'brief_channel' => 'whatsapp',
        'whatsapp_phone' => '+966 50 180 6978',
    ])->assertOk();

    expect($this->owner->refresh()->morning_brief)->toBeTrue()
        ->and($this->owner->whatsapp_phone)->toBe('+966501806978');
});

it('refuses a WhatsApp number it cannot place', function (): void {
    $this->actingAs($this->owner)->patchJson('/api/v1/me/preferences', ['whatsapp_phone' => 'call me'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('whatsapp_phone');
});

it('sends a test brief on request, and says where it went', function (): void {
    Mail::fake();

    $this->actingAs($this->owner)->postJson('/api/v1/me/brief/test')->assertStatus(202);

    Mail::assertSent(MorningBriefMail::class, 1);
});
