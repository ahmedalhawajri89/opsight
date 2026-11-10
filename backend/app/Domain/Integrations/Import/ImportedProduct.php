<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Import;

/**
 * A catalogue entry from a connected store (ADR-030, ADR-037).
 *
 * `cost` is null when the store has none worth writing. That is a different
 * thing from zero, and the difference is the whole reason the catalogue is
 * imported at all: null leaves a cost the owner typed here alone.
 */
final readonly class ImportedProduct
{
    public function __construct(
        public string $source,
        public ?string $externalId,
        public ?string $sku,
        public string $name,
        public string $price,
        public ?string $cost,
        public bool $isActive,
    ) {}
}
