<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Authorization\Ability;
use App\Domain\Brief\SendBrief;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * The morning brief, at eight in each business's own morning (phase C).
 *
 * HOURLY, BECAUSE THE BUSINESSES ARE NOT IN ONE TIMEZONE. A single 05:00 UTC
 * run would reach Riyadh at eight and Muscat at nine. Run every hour, it
 * sends to the businesses whose local clock has just reached the hour, and
 * SendBrief's per-day ledger makes a repeated or overlapping run harmless.
 */
class SendMorningBriefs extends Command
{
    protected $signature = 'opsight:brief:send
        {--now : Send to every opted-in user regardless of the hour (still once a day)}';

    protected $description = 'Send the morning brief to everyone who turned it on, at their business\'s morning hour';

    public function handle(SendBrief $send): int
    {
        $hour = (int) config('brief.hour', 8);
        $sent = $failed = 0;

        foreach (Business::query()->orderBy('id')->pluck('id') as $businessId) {
            CurrentBusiness::get()->run((int) $businessId, function () use ($send, $hour, &$sent, &$failed): void {
                $timezone = BusinessSetting::current()->timezone ?: 'UTC';

                if (! $this->option('now') && CarbonImmutable::now($timezone)->hour !== $hour) {
                    return;
                }

                $users = User::query()
                    ->where('is_active', true)
                    ->where('morning_brief', true)
                    ->get()
                    // Someone who cannot see the dashboard gets no summary of it.
                    ->filter(static fn (User $user): bool => $user->can(Ability::DashboardView->value));

                foreach ($users as $user) {
                    match ($send->daily($user)) {
                        'sent' => $sent++,
                        'failed' => $failed++,
                        default => null,
                    };
                }
            });
        }

        $this->components->info("Morning briefs: {$sent} sent, {$failed} failed.");

        return self::SUCCESS;
    }
}
