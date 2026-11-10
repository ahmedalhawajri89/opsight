<?php

declare(strict_types=1);

namespace App\Domain\Integrations;

use App\Models\Integration;
use App\Support\Tenancy\CurrentBusiness;

/**
 * The history a store already had before it connected (ADR-029, ADR-037).
 *
 * Webhooks only bring what happens next. Without this, a merchant who
 * connects on Tuesday sees a dashboard that says their business began on
 * Tuesday.
 *
 * SAFE TO RUN AGAIN. Every record goes through the same importer the
 * webhooks use, which finds its row by `(source, external_id)`; a second run
 * over the same dates updates rather than duplicates. It does not skip what
 * it has seen: re-reading is cheap, and skipping would leave an order edited
 * in the store after its first import wrong here for ever.
 */
final class Backfill
{
    /**
     * Runs inside the connection's own business.
     *
     * @return array{products: int, orders: int}
     */
    public function run(
        Connector $connector,
        Integration $connection,
        string $from,
        string $to,
        bool $withProducts = true,
        bool $dryRun = false,
    ): array {
        return CurrentBusiness::get()->run(
            (int) $connection->business_id,
            fn (): array => [
                /*
                 * The catalogue FIRST, and this order matters. An order's
                 * payload carries no cost, so a product first seen through an
                 * order is created costing zero — revenue with no margin.
                 * Importing the catalogue first means every product an order
                 * mentions already has its cost (ADR-030).
                 */
                'products' => $withProducts ? $this->products($connector, $connection, $dryRun) : 0,
                'orders' => $this->orders($connector, $connection, $from, $to, $dryRun),
            ],
        );
    }

    private function products(Connector $connector, Integration $connection, bool $dryRun): int
    {
        $count = 0;

        foreach ($connector->catalogue($connection) as $product) {
            $count++;

            if (! $dryRun) {
                $connector->importProduct($product);
            }
        }

        return $count;
    }

    private function orders(Connector $connector, Integration $connection, string $from, string $to, bool $dryRun): int
    {
        $count = 0;

        foreach ($connector->orders($connection, $from, $to) as $order) {
            $count++;

            if (! $dryRun) {
                // Each order is its own transaction, so a failure half way
                // leaves a partial import that running again completes.
                $connector->importOrder($order);
            }
        }

        if (! $dryRun && $count > 0) {
            $connection->forceFill(['last_synced_at' => now()])->save();
        }

        return $count;
    }
}
