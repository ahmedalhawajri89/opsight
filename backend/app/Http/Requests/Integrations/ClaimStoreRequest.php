<?php

declare(strict_types=1);

namespace App\Http\Requests\Integrations;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Which store a business is claiming.
 *
 * `provider` is validated against the registry rather than a hardcoded list,
 * so a provider that is not enabled on this installation cannot be named at
 * all — the same property the webhook route has.
 */
class ClaimStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        // The policy on the controller is the gate; this only shapes input.
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        /** @var array<string, class-string> $providers */
        $providers = config('integrations.providers', []);

        return [
            'provider' => ['required', 'string', Rule::in(array_keys($providers))],

            // Salla's merchant id is numeric, but a provider id is a provider's
            // own business; the column is 190 characters and so is this.
            'store_id' => ['required', 'string', 'max:190'],
        ];
    }
}
