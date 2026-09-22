<?php

declare(strict_types=1);

namespace App\Models;

use App\Authorization\Ability;
use App\Authorization\AbilityRegistry;
use App\Authorization\Role;
use App\Domain\Audit\RecordsActivity;
use App\Observers\AuditObserver;
use App\Support\Tenancy\BelongsToBusiness;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $name
 * @property string $email
 * @property string $password
 * @property Role $role
 * @property bool $is_active
 * @property Carbon|null $last_login_at
 */
#[ObservedBy(AuditObserver::class)]
class User extends Authenticatable
{
    use BelongsToBusiness;
    use RecordsActivity;

    /**
     * `password` and `remember_token` are dropped centrally by AuditRedactor
     * and are not listed here — a security rule with two enforcement sites has
     * one site that can be forgotten. `last_login_at` is listed, because it
     * moves on every single sign-in and `auth.login` already records that far
     * better than a diff of one timestamp.
     *
     * @return list<string>
     */
    public function auditIgnores(): array
    {
        return ['last_login_at'];
    }

    /** @use HasFactory<UserFactory> */
    use HasFactory;

    use Notifiable;

    /**
     * Explicit and narrow. `role` and `is_active` are deliberately absent:
     * both are privilege-bearing and are set only by the service that owns
     * the operation, never by a request payload (SECURITY.md §6).
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        // Personal preferences, set by the user for themselves through
        // PATCH /me/preferences — not a privilege, so not guarded like role.
        'locale',
        'numerals',
    ];

    /**
     * The column defaults, mirrored on the model.
     *
     * The database supplies them on INSERT, but an instance created in PHP
     * does not read them back — so a new user updated with only `locale`
     * still held `numerals = null` in memory, and passing that on crashed the
     * request. Declaring them here makes every instance carry a real value.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'locale' => 'en',
        'numerals' => 'latn',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'is_active' => 'boolean',
        ];
    }

    /**
     * The abilities this user's role grants.
     *
     * @return array<int, string>
     */
    public function abilities(): array
    {
        return AbilityRegistry::stringsFor($this->role);
    }

    /**
     * Ability check used by the Gate (see AuthServiceProvider).
     *
     * Application code calls `$user->can('expenses.view')` rather than
     * comparing role names, so ADR-003's eventual move to database-backed
     * roles stays a single-file change.
     */
    public function hasAbility(Ability|string $ability): bool
    {
        $ability = $ability instanceof Ability
            ? $ability
            : Ability::tryFrom($ability);

        // An unknown ability denies. Fail closed (SECURITY.md §2.4).
        if ($ability === null) {
            return false;
        }

        return AbilityRegistry::grants($this->role, $ability);
    }

    public function isOwner(): bool
    {
        return $this->role === Role::Owner;
    }
}
