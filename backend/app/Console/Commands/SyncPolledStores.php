<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Integrations\Connectors;
use App\Domain\Integrations\PolledConnector;
use App\Models\Integration;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Console\Command;
use Throwable;

/**
 * Asks each connected store that cannot tell Baydar about its changes
 * (WooCommerce, Shopify) for the orders it changed since the last look, and
 * records them.
 *
 * POLLING, NOT WEBHOOKS, ON PURPOSE. A webhook needs this server reachable
 * from the store and set up there by hand; asking is one direction only,
 * from Baydar out, and works the day the key is pasted. Every fifteen
 * minutes is fresh enough for a morning brief and a dashboard, and light on
 * a small shop.
 *
 * It asks for a few minutes before the last look, so an order saved in the
 * second the previous run started is not missed; recording is idempotent on
 * the store's order id, so the overlap costs nothing. A store that fails is
 * written up on its own card and the others carry on.
 */
class SyncPolledStores extends Command
{
    protected $signature = 'integrations:sync';

    protected $description = 'Fetch the orders each polled store (WooCommerce, Shopify) changed since the last look';

    private const OVERLAP_MINUTES = 5;

    public function handle(Connectors $connectors): int
    {
        $polled = array_values(array_filter(
            $connectors->names(),
            fn (string $name): bool => $connectors->get($name) instanceof PolledConnector,
        ));

        $connections = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->whereIn('provider', $polled)
            ->where('status', Integration::STATUS_CONNECTED)
            ->get();

        foreach ($connections as $connection) {
            $connector = $connectors->get($connection->provider);

            if (! $connector instanceof PolledConnector) {
                continue;
            }

            CurrentBusiness::get()->run((int) $connection->business_id, function () use ($connection, $connector): void {
                $started = now();
                $since = ($connection->last_synced_at ?? $started->copy()->subDay())
                    ->copy()->subMinutes(self::OVERLAP_MINUTES)->utc()->format('Y-m-d\TH:i:s');

                try {
                    $count = 0;

                    foreach ($connector->changedSince($connection, $since) as $order) {
                        $connector->importOrder($order);
                        $count++;
                    }

                    $connection->forceFill(['last_synced_at' => $started, 'last_error' => null])->save();
                    $this->line("{$connection->provider} {$connection->external_account_id}: {$count} orders");
                } catch (Throwable $e) {
                    report($e);
                    $connection->forceFill(['last_error' => 'Could not fetch new orders: '.$e->getMessage()])->save();
                }
            });
        }

        return self::SUCCESS;
    }
}
