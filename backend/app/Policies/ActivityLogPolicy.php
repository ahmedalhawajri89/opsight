<?php

declare(strict_types=1);

namespace App\Policies;

use App\Authorization\Ability;
use App\Models\ActivityLog;
use App\Models\User;

/**
 * The audit log is readable and nothing else.
 *
 * `create`, `update` and `delete` are absent rather than returning false,
 * which is the stronger statement: there is no application path that writes
 * through a policy check, because there is no application path that writes at
 * all except AuditRecorder. In a hardened deployment the database user holds
 * INSERT and SELECT on this table and nothing more, so tampering requires
 * administrative access — which is itself auditable (SECURITY.md §10).
 */
class ActivityLogPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can(Ability::ActivityView->value);
    }

    public function view(User $user, ActivityLog $log): bool
    {
        return $user->can(Ability::ActivityView->value);
    }

    public function export(User $user): bool
    {
        return $user->can(Ability::ActivityExport->value);
    }
}
