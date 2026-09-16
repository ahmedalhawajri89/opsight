<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'is_active' => $this->is_active,
            'last_login_at' => $this->last_login_at?->toIso8601String(),

            // The frontend's only source for permission decisions. There is no
            // second copy of the role → ability table in JavaScript
            // (ROLES_AND_PERMISSIONS.md §5.8).
            'abilities' => $this->abilities(),
        ];
    }
}
