<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use App\Domain\Integrations\Connector;
use App\Models\Integration;
use App\Models\Order;
use App\Models\Product;

/**
 * Salla, as one implementation of the connector contract (ADR-037).
 *
 * Nothing new is decided here. Every method delegates to a class that
 * existed before the contract did, which is the point: the contract was
 * shaped to fit Salla as it already worked.
 */
final class SallaConnector implements Connector
{
    public function __construct(
        private readonly SallaClient $client,
        private readonly ImportSallaOrder $orders,
        private readonly ImportSallaProduct $products,
    ) {}

    public function provider(): string
    {
        return SallaWebhooks::PROVIDER;
    }

    public function catalogue(Integration $connection): iterable
    {
        return $this->client->each($connection, 'products');
    }

    public function orders(Integration $connection, string $from, string $to): iterable
    {
        return $this->client->each($connection, 'orders', ['from_date' => $from, 'to_date' => $to]);
    }

    public function importProduct(array $payload): ?Product
    {
        return ($this->products)($payload);
    }

    public function importOrder(array $payload): Order
    {
        return ($this->orders)($payload);
    }
}
