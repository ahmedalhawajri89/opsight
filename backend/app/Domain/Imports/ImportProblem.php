<?php

declare(strict_types=1);

namespace App\Domain\Imports;

use RuntimeException;

/**
 * A file that cannot be imported at all, as opposed to one with bad rows.
 *
 * Carries a key into `lang/{locale}/imports.php` rather than a sentence, so
 * the owner reads it in their own language.
 */
final class ImportProblem extends RuntimeException
{
    /** @param array<string, scalar> $replace */
    public function __construct(public readonly string $key, public readonly array $replace = [])
    {
        parent::__construct($key);
    }
}
