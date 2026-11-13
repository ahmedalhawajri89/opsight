<?php

declare(strict_types=1);

namespace App\Domain\Integrations\WooCommerce;

use RuntimeException;

/**
 * The store, or the address, would not let Baydar in. The message is for the
 * owner, already in their language; `field` is the box it belongs beside.
 */
final class WooRefused extends RuntimeException
{
    public function __construct(public readonly string $field, string $message)
    {
        parent::__construct($message);
    }
}
