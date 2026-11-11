<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\AbilityRegistry;
use App\Authorization\Role;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The roles, what each may do, and who holds them.
 *
 * WHAT EACH MAY DO comes from AbilityRegistry, the one source of truth for
 * authorization. The screen draws its access table from these lists rather
 * than from a copy of its own, so the table cannot say a role may do what
 * the server would refuse.
 *
 * WHO HOLDS THEM, and how many accounts nobody is using: an account that
 * was never signed into, or not for a month, still opens the business to
 * whoever holds its password. That is the figure an owner reviewing access
 * needs, and it is counted here rather than read off one page of the list.
 */
class RoleController extends Controller
{
    /** Days without a sign-in before an active account is called dormant. */
    private const DORMANT_DAYS = 30;

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', User::class);

        // toBase() keeps the business scope and returns plain rows, so the
        // role arrives as the string it is stored as.
        $counts = [];

        foreach (User::query()->toBase()->selectRaw('role, is_active, COUNT(*) AS total')->groupBy('role', 'is_active')->get() as $row) {
            $counts[(string) $row->role][(int) $row->is_active] = (int) $row->total;
        }

        $count = static fn (Role $role, bool $active): int => $counts[$role->value][(int) $active] ?? 0;

        $dormantSince = now()->subDays(self::DORMANT_DAYS);

        return response()->json(['data' => [
            'roles' => array_map(static fn (Role $role): array => [
                'role' => $role->value,
                'label' => $role->label(),
                'abilities' => AbilityRegistry::stringsFor($role),
                'active' => $count($role, true),
                'deactivated' => $count($role, false),
            ], Role::cases()),
            'summary' => [
                'active' => User::query()->where('is_active', true)->count(),
                'deactivated' => User::query()->where('is_active', false)->count(),
                'never_signed_in' => User::query()->where('is_active', true)->whereNull('last_login_at')->count(),
                'dormant' => User::query()->where('is_active', true)->where('last_login_at', '<', $dormantSince)->count(),
                'dormant_days' => self::DORMANT_DAYS,
            ],
        ]]);
    }
}
