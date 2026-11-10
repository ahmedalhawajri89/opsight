<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Import;

/**
 * A customer as a connected store describes them, already in Baydar's terms
 * (ADR-037).
 *
 * Every field except the id is optional because stores disagree about what
 * they send. The phone is expected already normalised to E.164 by the
 * provider's mapper, which is the only place that knows how its store splits
 * a number.
 */
final readonly class ImportedCustomer
{
    public function __construct(
        public string $externalId,
        public string $name,
        public ?string $email = null,
        public ?string $phone = null,
        public ?string $city = null,
        public ?string $country = null,
    ) {}

    /**
     * The columns worth writing — absent values are left off, so a delivery
     * that omits the email does not erase one a previous delivery supplied.
     *
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return array_filter([
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'city' => $this->city,
            'country' => $this->country,
        ], static fn (?string $value): bool => $value !== null && $value !== '');
    }
}
