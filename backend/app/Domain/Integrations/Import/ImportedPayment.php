<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Import;

use App\Domain\Payments\PaymentMethod;

/**
 * Money a connected store says changed hands for an order (ADR-022, ADR-037).
 */
final readonly class ImportedPayment
{
    public function __construct(
        public string $amount,
        public PaymentMethod $method,
        /** The store's own word for the method, kept when it maps to `other`. */
        public ?string $reference = null,
    ) {}
}
