<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

/**
 * A business-owned model that is also READ one business at a time.
 *
 * Route model binding goes through the same scope, so /orders/{id} for another
 * business's order is a 404 — the row does not exist from here — rather than
 * a 403 that confirms it does.
 */
trait ScopedToBusiness
{
    use BelongsToBusiness;

    public static function bootScopedToBusiness(): void
    {
        static::addGlobalScope(new BusinessScope);
    }
}
