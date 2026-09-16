<?php

declare(strict_types=1);

namespace App\Domain\Inventory;

use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use LogicException;

/**
 * The only way stock ever moves.
 *
 * Every write goes through `move()`, which does three things in one atomic
 * step, under a row lock:
 *
 *   1. locks the product's inventory row,
 *   2. appends a ledger entry,
 *   3. updates the derived `stock_on_hand` cache.
 *
 * The lock is what makes concurrency correct: two orders confirming the last
 * unit at the same moment serialise here, so the second reads the
 * post-decrement value and fails cleanly rather than overselling
 * (ARCHITECTURE.md §7).
 *
 * CALLERS MUST ALREADY BE INSIDE A TRANSACTION. This class asserts that rather
 * than opening its own, because a stock movement is never the whole operation —
 * it is always part of confirming, cancelling or adjusting, and a lock that is
 * released before the surrounding work commits protects nothing.
 */
final class StockLedger
{
    /**
     * Apply a signed change to a product's stock.
     *
     * @param  int  $delta  negative for a sale, positive for a restock
     */
    public function move(
        Product $product,
        int $delta,
        string $reason,
        ?string $referenceType = null,
        ?int $referenceId = null,
        ?string $note = null,
        ?string $unitCost = null,
        ?int $actorId = null,
    ): InventoryMovement {
        $this->assertInTransaction();

        if ($delta === 0) {
            throw new InvalidArgumentException('A stock movement cannot be zero.');
        }

        // SELECT ... FOR UPDATE. Everything below is serialised per product.
        $item = InventoryItem::query()
            ->where('product_id', $product->id)
            ->lockForUpdate()
            ->first();

        if ($item === null) {
            $item = $this->createItemForProduct($product);
        }

        $balanceAfter = $item->stock_on_hand + $delta;

        if ($balanceAfter < 0) {
            // Read the true post-lock availability into the message, so the
            // error tells the user what is actually there rather than what was
            // there when they opened the page.
            throw $delta < 0 && $reason === InventoryMovement::REASON_SALE
                ? InsufficientStockException::forProduct($product->name, abs($delta), $item->stock_on_hand)
                : InsufficientStockException::wouldGoNegative($product->name, $balanceAfter);
        }

        $movement = InventoryMovement::create([
            'product_id' => $product->id,
            'quantity_delta' => $delta,
            'balance_after' => $balanceAfter,
            'reason' => $reason,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'unit_cost' => $unitCost,
            'note' => $note,
            'created_by' => $actorId,
            'occurred_at' => now(),
        ]);

        // The cache is updated in the same transaction as the ledger entry, so
        // the invariant can never be observed broken.
        $item->forceFill([
            'stock_on_hand' => $balanceAfter,
            'last_movement_at' => now(),
        ])->save();

        return $movement;
    }

    /**
     * Current stock, read under a lock.
     *
     * Use this when a decision depends on the value; an unlocked read is stale
     * the instant it returns.
     */
    public function availableForUpdate(Product $product): int
    {
        $this->assertInTransaction();

        return (int) (InventoryItem::query()
            ->where('product_id', $product->id)
            ->lockForUpdate()
            ->value('stock_on_hand') ?? 0);
    }

    public function createItemForProduct(Product $product, int $reorderPoint = 0): InventoryItem
    {
        // forceCreate: stock_on_hand is deliberately not fillable, because the
        // ledger is the only thing allowed to write it.
        return InventoryItem::forceCreate([
            'product_id' => $product->id,
            'stock_on_hand' => 0,
            'reserved_quantity' => 0,
            'reorder_point' => $reorderPoint,
        ]);
    }

    /**
     * The system's integrity canary.
     *
     * Returns every product whose cached stock disagrees with the sum of its
     * ledger. Drift is treated as a bug, not as data to be patched
     * (ARCHITECTURE.md §7).
     *
     * @return array<int, array{product_id:int, cached:int, ledger:int}>
     */
    public function findDrift(): array
    {
        $rows = DB::table('inventory_items as ii')
            ->leftJoin(
                DB::raw('(SELECT product_id, SUM(quantity_delta) AS ledger_total FROM inventory_movements GROUP BY product_id) as m'),
                'm.product_id',
                '=',
                'ii.product_id',
            )
            ->select([
                'ii.product_id',
                'ii.stock_on_hand as cached',
                DB::raw('COALESCE(m.ledger_total, 0) as ledger'),
            ])
            ->whereRaw('ii.stock_on_hand <> COALESCE(m.ledger_total, 0)')
            ->get();

        return $rows->map(fn ($row): array => [
            'product_id' => (int) $row->product_id,
            'cached' => (int) $row->cached,
            'ledger' => (int) $row->ledger,
        ])->all();
    }

    private function assertInTransaction(): void
    {
        if (DB::transactionLevel() === 0) {
            throw new LogicException(
                'StockLedger must be called inside a transaction. A lock released before the '
                .'surrounding work commits protects nothing.'
            );
        }
    }
}
