<?php

declare(strict_types=1);

namespace App\Http\Requests\Users;

use App\Authorization\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Creating a user.
 *
 * The password is set by an Owner rather than emailed as a reset link, because
 * the MVP has no mail transport and inventing one for a single flow would drag
 * in queue, template and deliverability concerns for no product value. The
 * trade is recorded in SECURITY.md §3: password reset by email is deferred
 * deliberately, and this is the flow that stands in for it.
 */
class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Authorization is the policy's job, in the controller. A FormRequest
        // that also decides it is a second answer to the same question.
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:160'],
            'email' => ['required', 'string', 'email', 'max:190', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'confirmed', Password::defaults()],
            'role' => ['required', Rule::in(array_column(Role::cases(), 'value'))],
        ];
    }
}
