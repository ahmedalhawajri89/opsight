<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use RuntimeException;

/** The store is already connected to a different business. */
final class ZidStoreTaken extends RuntimeException
{
    public function __construct(public readonly string $storeId)
    {
        parent::__construct("Zid store {$storeId} is already connected to another business.");
    }
}
