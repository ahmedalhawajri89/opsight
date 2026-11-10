<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use App\Domain\Integrations\Connector;
use App\Models\Integration;
use App\Models\Order;

/** Zid, as the second implementation of the connector contract (ADR-037). */
final class ZidConnector implements Connector
{
    public function __construct(
        private readonly ZidClient $client,
        private readonly ImportZidOrder $orders,
        private readonly ImportZidProduct $products,
    ) {}

    public function provider(): string
    {
        return ZidWebhooks::PROVIDER;
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
