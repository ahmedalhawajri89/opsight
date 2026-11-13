<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Integrations\WooCommerce\ImportWooOrder;
use App\Domain\Integrations\WooCommerce\WooClient;
use App\Models\Integration;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Console\Command;
use Throwable;

/**
 * Fetches the orders each connected WooCommerce store changed since the last
 * look, and records them.
 *
 * POLLING, NOT WEBHOOKS, ON PURPOSE. A WooCommerce webhook needs this server
 * reachable from the store and a secret set up in WordPress by hand; asking
 * is one direction only, from Baydar out, and works the day the key is
 * pasted. Every fifteen minutes is fresh enough for a morning brief and a
 * dashboard, and light on a small shop's host.
 *
 * It asks for a few minutes before the last look, so an order saved in the
 * second the previous run started is not missed; recording is idempotent on
 * the store's order id, so the overlap costs nothing.
 */
class SyncWooStores extends Command
{
    protected $signature = 'integrations:sync-woocommerce';

    protected $description = 'Fetch the orders each connected WooCommerce store changed since the last look';

    private const OVERLAP_MINUTES = 5;

    public function handle(WooClient $client, ImportWooOrder $import): int
    {
        $connections = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', ImportWooOrder::SOURCE)
            ->where('status', Integration::STATUS_CONNECTED)
            ->get();

        foreach ($connections as $connection) {
            CurrentBusiness::get()->run((int) $connection->business_id, function () use ($connection, $client, $import): void {
                $started = now();
                $since = ($connection->last_synced_at ?? $started->copy()->subDay())
                    ->copy()->subMinutes(self::OVERLAP_MINUTES)->utc()->format('Y-m-d\TH:i:s');

                try {
                    $count = 0;

                    foreach ($client->ordersChangedSince($connection, $since) as $order) {
                        $import($order);
                        $count++;
                    }

                    $connection->forceFill(['last_synced_at' => $started, 'last_error' => null])->save();
                    $this->line("{$connection->external_account_id}: {$count} orders");
                } catch (Throwable $e) {
                    report($e);
                    $connection->forceFill(['last_error' => 'Could not fetch new orders: '.$e->getMessage()])->save();
                }
            });
        }

        return self::SUCCESS;
    }
}
