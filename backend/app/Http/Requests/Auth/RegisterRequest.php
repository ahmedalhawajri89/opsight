<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * A new business and its owner (ADR-024).
 *
 * The email is unique across the whole installation, not per business: it is
 * what signing in is by, so it must name exactly one account.
 */
class RegisterRequest extends FormRequest
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
            'business_name' => ['required', 'string', 'min:2', 'max:160'],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:190', Rule::unique('users', 'email')],
            'password' => ['required', 'string', Password::defaults()],
            'locale' => ['sometimes', 'nullable', Rule::in(['en', 'ar'])],
        ];
    }
}
