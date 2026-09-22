<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use RuntimeException;

/**
 * A business-owned table was touched with no business in context (ADR-023).
 *
 * Thrown rather than answered with every business's rows: an unscoped query
 * that silently returns everything is the one tenancy bug that leaks data, so
 * the absence of a context is an error, never a default.
 */
final class MissingBusinessContext extends RuntimeException
{
    public static function make(): self
    {
        return new self('No business is in context. Sign in, or run this inside CurrentBusiness::run().');
    }
}
