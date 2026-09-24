<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * A user changing their OWN password.
 *
 * `current_password` proves the person at the keyboard is the account holder
 * and not someone who found it signed in — the one control that makes this
 * endpoint safe to offer to every role, rather than only to an Owner
 * (SECURITY.md §3).
 *
 * The new password meets the same policy as one an Owner sets: twelve
 * characters, checked against a breach corpus. There is one policy, and it is
 * not relaxed because the user set it themselves.
 */
class UpdatePasswordRequest extends FormRequest
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
            'current_password' => ['required', 'string', 'current_password:web'],
            'password' => ['required', 'string', 'different:current_password', Password::defaults()],
        ];
    }
}
