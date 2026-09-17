<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Role;
use App\Domain\Users\UserAdministration;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\StoreUserRequest;
use App\Http\Requests\Users\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\QueryFilter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * User administration.
 *
 * There is no destroy method, and its absence is the design. A deleted user
 * takes their audit attribution with them — `created_by` becomes null, and
 * every "who cancelled this order" question about the last three years becomes
 * unanswerable. Deactivation revokes access completely (EnsureUserIsActive
 * rejects the live session on the next request) while leaving the record
 * intact, which is what an internal system with an audit requirement needs.
 */
class UserController extends Controller
{
    public function __construct(private readonly UserAdministration $administration) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', User::class);

        $filter = new QueryFilter(
            filters: [
                'search' => QueryFilter::search(['name', 'email']),
                'role' => QueryFilter::exact('role'),
                'is_active' => QueryFilter::boolean('is_active'),
            ],
            sortable: ['name', 'email', 'role', 'last_login_at', 'created_at'],
            defaultSort: 'name',
        );

        return UserResource::collection(
            $filter->apply(User::query(), $request)
                ->paginate(QueryFilter::perPage($request))
                ->withQueryString(),
        );
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validated();

        $user = new User;

        // Only the fillable fields go through fill(). role and is_active are
        // not fillable by design and are set explicitly below, so a posted
        // `role` in the payload changes nothing (SECURITY.md §6.3).
        $user->fill([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
        ]);

        $user->forceFill([
            'role' => Role::from($validated['role']),
            'is_active' => true,
        ]);

        $user->auditAs('user.created', ['role' => $validated['role']]);
        $user->save();

        return UserResource::make($user)->response()->setStatusCode(201);
    }

    public function show(Request $request, User $user): UserResource
    {
        $this->authorize('view', $user);

        return UserResource::make($user);
    }

    /**
     * Name, email and password only.
     *
     * Role and activation are not reachable here — they are separate routes
     * running the last-Owner guard. An update endpoint that also accepted
     * `role` would let a privilege escalation ride along inside a name change,
     * and would need the guard duplicated into it.
     */
    public function update(UpdateUserRequest $request, User $user): UserResource
    {
        $this->authorize('update', $user);

        $validated = $request->validated();

        if (array_key_exists('password', $validated)) {
            /*
             * Audited as its own action with an EMPTY diff. The fact that the
             * password changed is the auditable event; the value never reaches
             * the table, in any form. AuditRedactor would drop the key anyway
             * — naming the action is what preserves the fact it happened
             * (SECURITY.md §10).
             */
            $user->auditAs('user.password_changed');
        }

        $user->fill($validated);
        $user->save();

        return UserResource::make($user->refresh());
    }

    public function changeRole(Request $request, User $user): UserResource
    {
        $this->authorize('changeRole', $user);

        $validated = $request->validate([
            'role' => ['required', Rule::in(array_column(Role::cases(), 'value'))],
        ]);

        return UserResource::make(
            $this->administration->changeRole(
                $user,
                Role::from($validated['role']),
                $request->user()?->id,
            ),
        );
    }

    public function activate(Request $request, User $user): UserResource
    {
        $this->authorize('deactivate', $user);

        return UserResource::make($this->administration->activate($user, $request->user()?->id));
    }

    public function deactivate(Request $request, User $user): UserResource
    {
        $this->authorize('deactivate', $user);

        return UserResource::make($this->administration->deactivate($user, $request->user()?->id));
    }
}
