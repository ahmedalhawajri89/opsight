<?php

declare(strict_types=1);

namespace App\Authorization;

/**
 * The four fixed roles.
 *
 * Roles are defined in code rather than stored as database rows (ADR-003):
 * the set is closed, product-defined, and changes to it should be reviewable
 * in a diff rather than mutated silently in a table.
 *
 * Nothing outside this namespace should branch on a role. Application code
 * asks `$user->can('expenses.view')` — see Ability and AbilityRegistry.
 */
enum Role: string
{
    case Owner = 'owner';
    case Manager = 'manager';
    case Analyst = 'analyst';
    case Staff = 'staff';

    public function label(): string
    {
        return match ($this) {
            self::Owner => 'Owner',
            self::Manager => 'Manager',
            self::Analyst => 'Analyst',
            self::Staff => 'Staff',
        };
    }

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $role): string => $role->value, self::cases());
    }
}
