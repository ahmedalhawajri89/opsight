<?php

declare(strict_types=1);

namespace App\Support;

use RuntimeException;

/**
 * Base class for a violated business rule.
 *
 * Distinct from a validation failure: the request was well-formed, but what it
 * asked for is not legal given the current state. That is a 409, not a 422 —
 * retrying with the same payload will never succeed.
 *
 * The property is `errorCode`, not `code`: PHP's Exception already declares a
 * non-readonly `$code`, and redeclaring it readonly is a fatal error.
 */
abstract class DomainException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $errorCode,
        public readonly int $status = 409,
    ) {
        parent::__construct($message);
    }
}
