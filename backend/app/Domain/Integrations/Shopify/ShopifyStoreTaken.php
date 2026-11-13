<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Shopify;

use RuntimeException;

/** The shop is already connected to another business. */
final class ShopifyStoreTaken extends RuntimeException
{
    public function __construct(public readonly string $shop)
    {
        parent::__construct("Shopify shop {$shop} is connected to another business.");
    }
}
