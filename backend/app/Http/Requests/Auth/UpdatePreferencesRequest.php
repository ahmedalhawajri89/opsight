<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use App\Support\Localization\Localizer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A user's own interface preferences.
 *
 * Only these two keys. Anything else in the payload is ignored by
 * `validated()`, so this endpoint cannot become a side door to a user's name,
 * email or — above all — role (SECURITY.md §6).
 */
class UpdatePreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Every signed-in user may choose their own language; auth:sanctum on
        // the route is the whole requirement.
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'locale' => ['sometimes', 'string', Rule::in(Localizer::LOCALES)],
            'numerals' => ['sometimes', 'string', Rule::in(Localizer::NUMERALS)],
        ];
    }
}
