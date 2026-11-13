<?php

declare(strict_types=1);

namespace App\Domain\Integrations\WooCommerce;

use RuntimeException;

/** The store is already connected to another business. */
final class WooStoreTaken extends RuntimeException
{
    public function __construct(public readonly string $store)
    {
        parent::__construct("WooCommerce store {$store} is connected to another business.");
    }
}
