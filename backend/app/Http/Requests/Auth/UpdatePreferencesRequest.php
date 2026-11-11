<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use App\Support\Localization\Localizer;
use App\Support\PhoneNumber;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

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
            // The morning brief (phase C): a personal choice like the language.
            'morning_brief' => ['sometimes', 'boolean'],
            'brief_channel' => ['sometimes', 'string', Rule::in(['email', 'whatsapp'])],
            'whatsapp_phone' => ['sometimes', 'nullable', 'string', 'max:32'],
        ];
    }

    /**
     * The WhatsApp number in E.164, by the same rule as every phone in the
     * system (ADR-021) — or a validation error if it cannot be placed.
     * Stored malformed, the brief would fail at eight every morning with
     * nobody watching.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $raw = $this->input('whatsapp_phone');

            if (! is_string($raw) || trim($raw) === '') {
                return;
            }

            $normalised = PhoneNumber::normalize($raw, null);

            if ($normalised === null) {
                $validator->errors()->add('whatsapp_phone', __('validation.phone', ['attribute' => 'whatsapp_phone']));

                return;
            }

            $this->merge(['whatsapp_phone' => $normalised]);
        });
    }

    /** @return array<string, mixed> */
    public function validated($key = null, $default = null): mixed
    {
        $data = parent::validated($key, $default);

        if ($key === null && is_array($data) && array_key_exists('whatsapp_phone', $data)) {
            $raw = $data['whatsapp_phone'];
            $data['whatsapp_phone'] = is_string($raw) && trim($raw) !== '' ? PhoneNumber::normalize($raw, null) : null;
        }

        return $data;
    }
}
