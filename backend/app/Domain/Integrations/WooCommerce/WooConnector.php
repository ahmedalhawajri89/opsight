<?php

declare(strict_types=1);

namespace App\Domain\Integrations\WooCommerce;

use App\Domain\Integrations\Connector;
use App\Models\Integration;
use App\Models\Order;

/** WooCommerce behind the shared connector contract: the backfill runs it as it runs Salla and Zid. */
final class WooConnector implements Connector
{
    public function __construct(
        private readonly WooClient $client,
        private readonly ImportWooOrder $orders,
        private readonly ImportWooProduct $products,
    ) {}

    public function provider(): string
    {
        return ImportWooOrder::SOURCE;
    }

    public function catalogue(Integration $connection): iterable
    {
        return $this->client->products($connection);
    }

    public function orders(Integration $connection, string $from, string $to): iterable
    {
        return $this->client->orders($connection, $from, $to);
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
