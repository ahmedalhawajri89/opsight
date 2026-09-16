<?php

declare(strict_types=1);

namespace App\Domain\Inventory;

use App\Models\InventoryMovement;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Manual stock corrections and restocks.
 *
 * An adjustment is entered as a DELTA, not as a target value. "Set stock to 40"
 * is ambiguous under concurrency — two people setting 40 and 45 leave no record
 * of what actually changed — whereas "+5" composes correctly and leaves an
 * auditable trail (MVP_SCOPE.md §6.6).
 */
final class AdjustStock
{
    public function __construct(private readonly StockLedger $ledger) {}

    /**
     * Correct a discrepancy, a loss or damage.
     *
     * A reason is mandatory: an unexplained stock change is indistinguishable
     * from theft when someone reviews the ledger a month later.
     */
    public function adjust(
        Product $product,
        int $delta,
        string $note,
        string $reason = InventoryMovement::REASON_ADJUSTMENT,
        ?int $actorId = null,
    ): InventoryMovement {
        $note = trim($note);

        if ($note === '') {
            throw InsufficientStockException::reasonRequired();
        }

        return DB::transaction(fn (): InventoryMovement => $this->ledger->move(
            product: $product,
            delta: $delta,
            reason: $reason,
            referenceType: 'manual',
            referenceId: null,
            note: $note,
            actorId: $actorId,
        ));
    }

    /**
     * Receive stock.
     *
     * `unitCost` is recorded on the movement so a future inventory valuation
     * has a cost basis to work from (ADR-014). It does NOT update the product's
     * cost — that is a separate, deliberate decision by a manager, not a side
     * effect of a delivery arriving.
     *
     * This flow never creates an expense row. Stock purchases reach profit
     * through COGS at the point of sale; recording them as an expense as well
     * would double-count them (MVP_SCOPE.md §6.7).
     */
    public function restock(
        Product $product,
        int $quantity,
        ?string $unitCost = null,
        ?string $note = null,
        ?int $actorId = null,
    ): InventoryMovement {
        if ($quantity < 1) {
            throw new InvalidArgumentException('A restock must add at least one unit.');
        }

        return DB::transaction(fn (): InventoryMovement => $this->ledger->move(
            product: $product,
            delta: $quantity,
            reason: InventoryMovement::REASON_RESTOCK,
            referenceType: 'manual',
            referenceId: null,
            note: $note,
            unitCost: $unitCost,
            actorId: $actorId,
        ));
    }
}
