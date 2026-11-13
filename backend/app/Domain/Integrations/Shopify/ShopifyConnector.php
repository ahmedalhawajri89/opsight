<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Shopify;

use App\Domain\Integrations\PolledConnector;
use App\Models\Integration;
use App\Models\Order;

/** Shopify behind the shared contract: backfilled like the others, polled for changes. */
final class ShopifyConnector implements PolledConnector
{
    public function __construct(
        private readonly ShopifyClient $client,
        private readonly ImportShopifyOrder $orders,
        private readonly ImportShopifyProduct $products,
    ) {}

    public function provider(): string
    {
        return ImportShopifyOrder::SOURCE;
    }

    public function catalogue(Integration $connection): iterable
    {
        return $this->client->products($connection);
    }

    public function orders(Integration $connection, string $from, string $to): iterable
    {
        return $this->client->orders($connection, $from, $to);
    }

    public function changedSince(Integration $connection, string $since): iterable
    {
        return $this->client->ordersChangedSince($connection, $since);
    }

    public function importProduct(array $payload): void
    {
        ($this->products)($payload);
    }

    public function importOrder(array $payload): Order
    {
        return ($this->orders)($payload);
    }
}
