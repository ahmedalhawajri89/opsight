<?php

declare(strict_types=1);

namespace App\Http\Requests\Users;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Editing a user's own details.
 *
 * `role` and `is_active` are absent from the rule set ENTIRELY, not merely
 * ignored. An unknown key here is rejected by the controller's use of
 * `validated()`, so posting a role into this endpoint changes nothing and the
 * caller does not get a 200 that implies otherwise (SECURITY.md §6.4).
 */
class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        /** @var User|null $user */
        $user = $this->route('user');

        return [
            'name' => ['sometimes', 'string', 'max:160'],
            'email' => [
                'sometimes', 'string', 'email', 'max:190',
                Rule::unique('users', 'email')->ignore($user?->id),
            ],
            'password' => ['sometimes', 'string', 'confirmed', Password::defaults()],
        ];
    }
}
