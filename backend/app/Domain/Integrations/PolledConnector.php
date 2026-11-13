<?php

declare(strict_types=1);

namespace App\Domain\Integrations;

use App\Models\Integration;

/**
 * A store Baydar asks for its changes rather than one that tells it: the
 * owner's own key reaches the store, but nothing reaches Baydar (WooCommerce,
 * Shopify). SyncPolledStores calls changedSince() every quarter hour.
 */
interface PolledConnector extends Connector
{
    /**
     * Orders created or changed since a moment (UTC, `Y-m-d\TH:i:s`).
     *
     * @return iterable<array<string, mixed>>
     */
    public function changedSince(Integration $connection, string $since): iterable;
}
