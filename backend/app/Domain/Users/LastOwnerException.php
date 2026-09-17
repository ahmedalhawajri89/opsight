<?php

declare(strict_types=1);

namespace App\Domain\Users;

use App\Support\DomainException;

/**
 * The system must always have at least one active Owner.
 *
 * A 409, not a 403: the caller is permitted to change roles and to deactivate
 * users. What they asked for is simply not legal in the current state, and
 * retrying the identical request will never succeed — which is exactly the
 * distinction DomainException draws.
 */
final class LastOwnerException extends DomainException
{
    public static function cannotDemote(): self
    {
        return new self(
            __('errors.users.last_owner_demote'),
            'users.last_owner',
        );
    }

    public static function cannotDeactivate(): self
    {
        return new self(
            __('errors.users.last_owner_deactivate'),
            'users.last_owner',
        );
    }
}
