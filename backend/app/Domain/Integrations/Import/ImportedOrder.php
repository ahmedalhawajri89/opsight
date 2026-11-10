<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Import;

use App\Domain\Orders\OrderStatus;
use Illuminate\Support\Carbon;

/**
 * An order from a connected store, already translated into Baydar's
 * vocabulary (ADR-037).
 *
 * THE SEAM BETWEEN WHAT VARIES AND WHAT MUST NOT. Everything that differs
 * from one store to the next — status words, money shapes, where the phone
 * number lives, what a cancellation is called — is settled by the
 * provider's mapper before one of these exists. Everything that must be the
 * same for every store — idempotency, leaving stock alone, never
 * repopulating an erased customer — is done by RecordImportedOrder, once.
 *
 * The totals are the store's own and are written as they arrived. They are
 * not recomputed from the lines, so a reconciler compares against something
 * independent rather than our arithmetic against itself.
 */
final readonly class ImportedOrder
{
    /**
     * @param  list<ImportedLine>|null  $lines  null when the delivery carried no
     *                                          line list at all — the lines already
     *                                          stored are then left as they are,
     *                                          which is not the same as an order
     *                                          that now has none
     * @param  list<ImportedPayment>  $payments
     * @param  array<string, mixed>  $context  extra facts for the audit row
     */
    public function __construct(
        public string $source,
        public string $externalId,
        public OrderStatus $status,
        public Carbon $placedAt,
        public ?ImportedCustomer $customer,
        public ?array $lines,
        public string $subtotal,
        public string $discount,
        public string $tax,
        public string $shipping,
        public string $total,
        public array $payments,
        /** Shown on a cancelled order, in the store's name: "Cancelled in Salla". */
        public string $cancellationReason,
        public array $context = [],
    ) {}
}
