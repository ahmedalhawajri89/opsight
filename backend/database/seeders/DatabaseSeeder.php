<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Authorization\Role;
use App\Domain\Audit\AuditRecorder;
use App\Models\BusinessSetting;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Phase 01 seed: business settings plus one user per role.
 *
 * Four fixed accounts exist so the authorization matrix can be exercised by
 * hand in the browser, not only in the test suite. Realistic operational data
 * (three years of orders, products whose cost changed mid-history) arrives in
 * Phase 03, when there are tables to put it in.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        /*
         * Seeding is not a user action, so it does not produce user audit rows.
         *
         * A row written here would name the seeding process as the actor, the
         * console as the origin and today as the moment — for an order the
         * dataset claims was placed fourteen months ago. Every field would be
         * false. DemoDataSeeder writes a small, honest activity history of its
         * own instead (SECURITY.md §10).
         */
        AuditRecorder::pause();

        try {
            $this->seed();
        } finally {
            AuditRecorder::resume();
        }
    }

    private function seed(): void
    {
        BusinessSetting::ensureExists(['company_name' => 'Opsight Demo Trading']);

        $accounts = [
            ['Ahmed Al Hawajri', 'owner@opsight.test', Role::Owner],
            ['Layla Hassan', 'manager@opsight.test', Role::Manager],
            ['Noor Abdulla', 'analyst@opsight.test', Role::Analyst],
            ['Yousif Kamal', 'staff@opsight.test', Role::Staff],
        ];

        $this->seedAccounts($accounts);

        /*
         * Demo data is opt-in: `php artisan db:seed` gives a clean install with
         * only the accounts and settings, and `--class=DemoDataSeeder` adds
         * three years of realistic history. A fresh production deployment must
         * not arrive pre-populated with invented orders.
         */
        if (app()->environment('local', 'testing') && config('app.seed_demo_data')) {
            $this->call(DemoDataSeeder::class);
        }
    }

    /**
     * @param  array<int, array{0: string, 1: string, 2: Role}>  $accounts
     */
    private function seedAccounts(array $accounts): void
    {
        foreach ($accounts as [$name, $email, $role]) {
            $user = User::firstOrNew(['email' => $email]);

            $user->fill([
                'name' => $name,
                'password' => 'password',
            ]);

            // role and is_active are not fillable by design (SECURITY.md §6),
            // so the seeder sets them explicitly like any other service would.
            $user->role = $role;
            $user->is_active = true;
            $user->save();
        }
    }
}
