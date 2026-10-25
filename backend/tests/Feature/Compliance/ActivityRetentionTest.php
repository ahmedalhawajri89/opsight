<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\User;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Console\Scheduling\Schedule;

/*
|--------------------------------------------------------------------------
| Keeping the audit log only as long as the business asks (ADR-026)
|--------------------------------------------------------------------------
|
| Relative arithmetic, not a frozen clock: no test in this suite uses
| travelTo, RefreshDatabase does not reset Carbon::setTestNow, and a leaked
| test clock would poison every later metric test.
|
*/

/** An audit row aged by writing its created_at directly. */
function agedEntry(int $daysAgo, ?int $businessId = null): ActivityLog
{
    $row = new ActivityLog;
    $row->forceFill([
        'business_id' => $businessId ?? CurrentBusiness::get()->idOrNull(),
        'action' => 'customer.updated',
        'created_at' => now()->subDays($daysAgo),
    ]);
    $row->saveQuietly();

    return $row;
}

function retentionOf(int $days): void
{
    BusinessSetting::current()->forceFill(['activity_retention_days' => $days])->save();
    BusinessSetting::flushCache();
}

/*
|--------------------------------------------------------------------------
| The window
|--------------------------------------------------------------------------
*/

it('deletes what is past the window and keeps what is inside it', function (): void {
    retentionOf(730);

    $old = agedEntry(731);
    $recent = agedEntry(729);

    $this->artisan('opsight:prune-activity')->assertSuccessful();

    expect(ActivityLog::query()->whereKey($old->id)->exists())->toBeFalse()
        ->and(ActivityLog::query()->whereKey($recent->id)->exists())->toBeTrue();
});

it('reads the window from settings rather than a constant', function (): void {
    // Shortened through the API the Owner actually uses.
    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->patchJson('/api/v1/settings', ['activity_retention_days' => 30])
        ->assertOk();

    BusinessSetting::flushCache();

    $old = agedEntry(31);
    $recent = agedEntry(29);

    $this->artisan('opsight:prune-activity')->assertSuccessful();

    expect(ActivityLog::query()->whereKey($old->id)->exists())->toBeFalse()
        ->and(ActivityLog::query()->whereKey($recent->id)->exists())->toBeTrue();
});

it('refuses a window short enough to outrun an investigation', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['activity_retention_days' => 29])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('activity_retention_days');

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['activity_retention_days' => 3651])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('activity_retention_days');
});

it('names the setting as destructive, and not as history-affecting', function (): void {
    /*
     * Three different warnings, because they mean three different things:
     * affects_history restates figures without touching a record, and this
     * one destroys records without moving a figure.
     */
    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson('/api/v1/settings')
        ->assertOk()
        ->assertJsonPath('meta.destructive', ['activity_retention_days'])
        ->assertJsonPath('data.activity_retention_days', 730);

    expect(BusinessSetting::current()->activity_retention_days)->toBe(730);
});

/*
|--------------------------------------------------------------------------
| Per business, and resilient
|--------------------------------------------------------------------------
*/

it('applies each business its own window, not the first one it read', function (): void {
    retentionOf(30);

    $mine = agedEntry(100);

    $other = Business::query()->create(['name' => 'Al Noor Trading', 'slug' => 'al-noor-'.uniqid()]);

    $theirs = CurrentBusiness::get()->run($other->id, function () {
        BusinessSetting::query()->create(['business_id' => null, 'company_name' => 'Al Noor Trading', 'activity_retention_days' => 3650]);
        BusinessSetting::flushCache();

        return agedEntry(100);
    });

    $this->artisan('opsight:prune-activity')->assertSuccessful();

    // Mine is past thirty days; theirs is well inside ten years.
    expect(ActivityLog::query()->whereKey($mine->id)->exists())->toBeFalse()
        ->and(
            ActivityLog::query()->withoutGlobalScope(BusinessScope::class)->whereKey($theirs->id)->exists()
        )->toBeTrue();
});

it('carries on past a broken business, and says the run failed', function (): void {
    retentionOf(30);
    $mine = agedEntry(100);

    // A business with no settings row: reading its retention throws.
    Business::query()->create(['name' => 'Half Built', 'slug' => 'half-built-'.uniqid()]);

    $this->artisan('opsight:prune-activity')->assertFailed();

    // The healthy business was still pruned, which is the point.
    expect(ActivityLog::query()->whereKey($mine->id)->exists())->toBeFalse();
});

/*
|--------------------------------------------------------------------------
| What it leaves behind
|--------------------------------------------------------------------------
*/

it('records the prune, after the delete rather than before it', function (): void {
    retentionOf(30);
    $old = agedEntry(100);

    $this->artisan('opsight:prune-activity')->assertSuccessful();

    $row = ActivityLog::query()->where('action', 'activity.pruned')->firstOrFail();

    expect($row->context['deleted'])->toBe(1)
        ->and($row->context['retention_days'])->toBe(30)
        ->and(ActivityLog::query()->whereKey($old->id)->exists())->toBeFalse()
        /*
         * Written AFTER the delete: a version that records first would have
         * swept away its own row, and firstOrFail above would not have found
         * it. Asserted on this row rather than on a total, because changing a
         * setting is itself audited and the totals move for honest reasons.
         */
        ->and(ActivityLog::query()->whereKey($row->id)->exists())->toBeTrue();
});

it('sweeps the rows that belong to no business at all', function (): void {
    /*
     * A failed sign-in for an address matching no account has a NULL
     * business_id, and BusinessScope hides those from every per-business pass
     * — so without an unscoped sweep they would never be pruned, and a table
     * that only grows is a slow leak.
     */
    retentionOf(30);

    $orphan = agedEntry(100, businessId: null);

    $this->artisan('opsight:prune-activity')->assertSuccessful();

    expect(
        ActivityLog::query()->withoutGlobalScope(BusinessScope::class)->whereKey($orphan->id)->exists()
    )->toBeFalse();
});

it('deletes nothing on a dry run, and still reports the count', function (): void {
    retentionOf(30);
    $old = agedEntry(100);

    $this->artisan('opsight:prune-activity', ['--dry-run' => true])
        ->expectsOutputToContain('1 entries would be deleted.')
        ->assertSuccessful();

    expect(ActivityLog::query()->whereKey($old->id)->exists())->toBeTrue()
        ->and(ActivityLog::query()->where('action', 'activity.pruned')->exists())->toBeFalse();
});

/*
|--------------------------------------------------------------------------
| That it will actually run
|--------------------------------------------------------------------------
*/

it('is scheduled daily, so none of the above depends on someone remembering', function (): void {
    // Boot the console kernel: routes/console.php is loaded by command
    // discovery, which runs on Artisan boot rather than on app boot.
    $this->artisan('schedule:list')->assertSuccessful();

    $events = collect(app(Schedule::class)->events())
        ->filter(fn ($event): bool => str_contains((string) $event->command, 'opsight:prune-activity'));

    expect($events)->toHaveCount(1)
        ->and($events->first()->expression)->toBe('15 3 * * *');
});
