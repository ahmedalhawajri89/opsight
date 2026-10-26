<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Database\Seeders\SecondBusinessSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Removes one business, or one account, that a browser test created.
 *
 * Two specs sign a stranger up and create a member of staff, and they do it
 * against the real API rather than a mock — which is the point of them, and
 * also means each run leaves a real row behind. Left alone they accumulate:
 * twenty-five runs put twenty-four stray accounts in the first business, the
 * users screen pages at twenty-five rows, and two seeded accounts fell off
 * the first page. Three specs then failed for a reason that had nothing to
 * do with the code under test.
 *
 * The product has no delete for either (accounts are deactivated by an owner,
 * never deleted — SECURITY.md §10), and adding one so the tests could tidy up
 * would be building a demolition door into the application to keep the test
 * suite neat. So this lives in a console command instead, where production
 * can refuse it outright.
 *
 * It takes the exact name or address the spec generated, not a pattern: a
 * command that deletes everything matching `E2E%` is one careless rename away
 * from deleting a real business called "E2E Supplies".
 */
class PruneE2eData extends Command
{
    protected $signature = 'opsight:e2e:prune {--business= : Exact business name} {--user= : Exact account email}';

    protected $description = 'Delete a business or an account created by a browser test';

    /**
     * What the seeders make. Named here so a typo in a spec can never hand
     * this command a seeded business or one of the four accounts the suite
     * signs in with (DatabaseSeeder:49,62-65 and SecondBusinessSeeder).
     */
    private const PROTECTED_SLUGS = ['default', SecondBusinessSeeder::SLUG];

    private const PROTECTED_EMAILS = [
        'owner@opsight.test',
        'manager@opsight.test',
        'analyst@opsight.test',
        'staff@opsight.test',
        SecondBusinessSeeder::OWNER_EMAIL,
    ];

    /**
     * Children before parents: every business_id foreign key is RESTRICT, so
     * the order is the schema's and not a preference. order_items before
     * orders, products after what points at them, categories last of the
     * catalogue.
     */
    private const SCOPED_TABLES = [
        'order_refunds',
        'order_payments',
        'order_items',
        'orders',
        'inventory_movements',
        'inventory_items',
        'products',
        'categories',
        'customers',
        'expenses',
        'expense_categories',
        'activity_logs',
        'business_settings',
        'integrations',
        'users',
    ];

    public function handle(): int
    {
        if (app()->isProduction() || config('demo.enabled')) {
            $this->error('Refused: this command deletes data and only runs on a development installation.');

            return self::FAILURE;
        }

        $business = $this->option('business');
        $user = $this->option('user');

        if ($business === null && $user === null) {
            $this->error('Nothing to prune: pass --business or --user.');

            return self::FAILURE;
        }

        if ($business !== null && ! $this->pruneBusiness((string) $business)) {
            return self::FAILURE;
        }

        if ($user !== null && ! $this->pruneUser((string) $user)) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    private function pruneBusiness(string $name): bool
    {
        $row = DB::table('businesses')->where('name', $name)->first(['id', 'slug']);

        if ($row === null) {
            // Not an error: a spec that failed before sign-up has nothing to
            // undo, and saying so must not turn a green run red.
            $this->line("No business named \"{$name}\"; nothing to prune.");

            return true;
        }

        if (in_array($row->slug, self::PROTECTED_SLUGS, true)) {
            $this->error("Refused: \"{$name}\" is a seeded business.");

            return false;
        }

        $deleted = DB::transaction(function () use ($row): int {
            $rows = 0;

            foreach (self::SCOPED_TABLES as $table) {
                $rows += DB::table($table)->where('business_id', $row->id)->delete();
            }

            // The only business_id that is nullable, because a receipt can
            // arrive before anyone knows whose it is (ADR-027).
            DB::table('webhook_receipts')->where('business_id', $row->id)->update(['business_id' => null]);

            return $rows + DB::table('businesses')->where('id', $row->id)->delete();
        });

        $this->info("Pruned business \"{$name}\": {$deleted} rows.");

        return true;
    }

    private function pruneUser(string $email): bool
    {
        $row = DB::table('users')->where('email', $email)->first(['id']);

        if ($row === null) {
            $this->line("No account for {$email}; nothing to prune.");

            return true;
        }

        if (in_array($email, self::PROTECTED_EMAILS, true)) {
            $this->error("Refused: {$email} is a seeded account.");

            return false;
        }

        $deleted = DB::transaction(function () use ($row): int {
            /*
             * The audit rows go too, and only this account's.
             *
             * Every foreign key into users is SET NULL, so leaving them would
             * put an actorless row at the top of the activity log on every
             * run — and the screen that shows who did what would slowly fill
             * with entries that say nobody did. The log is append-only to the
             * application, which is a rule about what the product may do to a
             * real record, not about a test clearing up after itself.
             */
            $rows = DB::table('activity_logs')
                ->where('user_id', $row->id)
                ->orWhere(function ($query) use ($row) {
                    $query->where('subject_type', 'User')->where('subject_id', $row->id);
                })
                ->delete();

            return $rows + DB::table('users')->where('id', $row->id)->delete();
        });

        $this->info("Pruned account {$email}: {$deleted} rows.");

        return true;
    }
}
