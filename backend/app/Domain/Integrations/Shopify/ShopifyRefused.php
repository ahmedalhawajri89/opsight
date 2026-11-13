<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Shopify;

use RuntimeException;

/** Shopify, or the shop name, would not let Baydar in; `field` is the box it belongs beside. */
final class ShopifyRefused extends RuntimeException
{
    public function __construct(public readonly string $field, string $message)
    {
        parent::__construct($message);
    }
}
