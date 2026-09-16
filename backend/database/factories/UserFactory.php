<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Authorization\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password = null;

    /**
     * Defaults to Staff — the least-privileged role — so a test that forgets
     * to specify a role gets the one that can do the least, and an
     * authorization hole shows up as a failing test rather than a pass.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => Role::Staff,
            'is_active' => true,
            'remember_token' => Str::random(10),
        ];
    }

    public function role(Role $role): static
    {
        return $this->state(fn (): array => ['role' => $role]);
    }

    public function owner(): static
    {
        return $this->role(Role::Owner);
    }

    public function manager(): static
    {
        return $this->role(Role::Manager);
    }

    public function analyst(): static
    {
        return $this->role(Role::Analyst);
    }

    public function staff(): static
    {
        return $this->role(Role::Staff);
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => ['is_active' => false]);
    }

    public function unverified(): static
    {
        return $this->state(fn (): array => ['email_verified_at' => null]);
    }
}
