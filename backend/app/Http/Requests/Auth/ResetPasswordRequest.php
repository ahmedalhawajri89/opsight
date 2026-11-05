<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * Choosing a new password from an emailed link. The password is held to the
 * same rule as sign-up and as changing it while signed in: a reset is not a
 * way around the policy.
 */
class ResetPasswordRequest extends FormRequest
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
        return [
            'token' => ['required', 'string', 'max:200'],
            'email' => ['required', 'string', 'email', 'max:190'],
            'password' => ['required', 'string', Password::defaults()],
        ];
    }
}
