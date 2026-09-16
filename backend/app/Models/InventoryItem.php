<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Current stock state — a DERIVED CACHE over the ledger, not a source of truth.
 *
 * `stock_on_hand` and `reserved_quantity` are deliberately NOT fillable. They
 * are written only by the ledger, inside a transaction, under a row lock.
 *
 * @property int $stock_on_hand
 * @property int $reorder_point
 * @property Carbon|null $last_movement_at
 */
class InventoryItem extends Model
{
    /** @var list<string> */
    protected $fillable = ['product_id', 'reorder_point'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'stock_on_hand' => 'integer',
            'reserved_quantity' => 'integer',
            'reorder_point' => 'integer',
            'last_movement_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * The threshold at which this product counts as low stock.
     *
     * Product-level override first, then the item's reorder point, then the
     * business default (METRICS.md §2.18).
     */
    public function effectiveThreshold(): int
    {
        return $this->product->low_stock_threshold
            ?? ($this->reorder_point > 0
                ? $this->reorder_point
                : BusinessSetting::current()->default_low_stock_threshold);
    }

    public function isLowStock(): bool
    {
        return $this->stock_on_hand <= $this->effectiveThreshold();
    }
}
