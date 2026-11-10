<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Import;

/**
 * One line of an imported order (ADR-037).
 *
 * The product is described rather than resolved: finding or creating it is
 * the writer's job, because the matching rule — the provider's own id first,
 * then the SKU — is the same for every store and must not drift between
 * them.
 */
final readonly class ImportedLine
{
    public function __construct(
        /** The store's id for the product, if it sent one. */
        public ?string $productExternalId,
        /** The SKU to match an existing product on, or create one with. */
        public ?string $productSku,
        /** The name a product created from this line would carry. */
        public string $productName,
        /** The catalogue price a product created from this line would carry. */
        public string $productPrice,
        /** The line's own name as the store printed it, if any. */
        public ?string $name,
        /** The line's own SKU as the store printed it, if any. */
        public ?string $sku,
        /** What the line is called when neither it nor its product has a name. */
        public string $fallbackName,
        public int $quantity,
        /** The line before tax. Unit price is derived from it. */
        public string $lineTotal,
        public string $discount,
    ) {}
}
