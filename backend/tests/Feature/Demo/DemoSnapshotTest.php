<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\User;
use App\Support\DemoSnapshot;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\File;

/*
|--------------------------------------------------------------------------
| The demo snapshot
|--------------------------------------------------------------------------
|
| App\Support\DemoSnapshot. What a visitor changes is undone, what they add is
| gone, and the dates move forward by whole weeks only, so the history keeps
| ending this week and every day keeps its weekday.
|
*/

beforeEach(function (): void {
    $this->path = storage_path('framework/testing/demo-snapshot');
    File::deleteDirectory($this->path);
    $this->snapshot = new DemoSnapshot($this->path);
});

afterEach(fn () => File::deleteDirectory($this->path));

it('undoes what visitors changed and moves the dates by whole weeks', function (): void {
    $user = User::factory()->role(Role::Staff)->create(['name' => 'Before']);
    $user->forceFill(['created_at' => '2026-03-02 09:30:00'])->save(); // a Monday

    $this->snapshot->capture();

    $user->forceFill(['name' => 'Changed by a visitor'])->save();
    $stranger = User::factory()->role(Role::Staff)->create();

    $restored = $this->snapshot->restore(now()->addDays(16));

    $fresh = User::query()->findOrFail($user->id);

    expect($restored['shifted_days'])->toBe(14)
        ->and($fresh->name)->toBe('Before')
        ->and($fresh->created_at->toDateTimeString())->toBe('2026-03-16 09:30:00')
        ->and($fresh->created_at->dayOfWeek)->toBe(Carbon::MONDAY)
        ->and(User::query()->find($stranger->id))->toBeNull();
});

it('leaves the dates alone within the first week', function (): void {
    $user = User::factory()->role(Role::Staff)->create();
    $user->forceFill(['created_at' => '2026-03-02 09:30:00'])->save();

    $this->snapshot->capture();

    expect($this->snapshot->restore(now()->addDays(6))['shifted_days'])->toBe(0)
        ->and(User::query()->findOrFail($user->id)->created_at->toDateTimeString())->toBe('2026-03-02 09:30:00');
});
