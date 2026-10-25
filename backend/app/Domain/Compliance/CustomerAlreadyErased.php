<?php

declare(strict_types=1);

namespace App\Domain\Compliance;

use App\Support\DomainException;

/**
 * A second erasure request for a customer already erased.
 *
 * A refusal rather than a silent no-op, and a 409 rather than a 403: the
 * operator may erase, and the reason this one cannot proceed is the record's
 * state, not their authority. Told apart, the screen can say "this person was
 * already forgotten, on the fourth of March" instead of "you may not".
 */
class CustomerAlreadyErased extends DomainException
{
    public static function make(): self
    {
        return new self(
            __('errors.customer.already_erased'),
            'customer.already_erased',
        );
    }
}
