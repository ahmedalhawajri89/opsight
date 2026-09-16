<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * An append-only ledger entry. THE source of truth for stock.
 *
 * UPDATED_AT is disabled because a ledger entry is never edited, and the
 * application exposes no update or delete path for this model. A mistake is
 * corrected by a compensating entry, so both stay on record.
 *
 * @property int $quantity_delta
 * @property int $balance_after
 * @property Carbon $occurred_at
 * @property Carbon|null $created_at
 */
class InventoryMovement extends Model
{
    public const UPDATED_AT = null;

    public const REASON_SALE = 'sale';

    public const REASON_SALE_CANCELLED = 'sale_cancelled';

    public const REASON_SALE_REFUNDED = 'sale_refunded';

    public const REASON_RESTOCK = 'restock';

    public const REASON_ADJUSTMENT = 'adjustment';

    public const REASON_DAMAGE = 'damage';

    public const REASON_LOSS = 'loss';

    public const REASON_INITIAL = 'initial';

    /** @var list<string> */
    protected $fillable = [
        'product_id',
        'quantity_delta',
        'balance_after',
        'reason',
        'reference_type',
        'reference_id',
        'unit_cost',
        'note',
        'created_by',
        'occurred_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'quantity_delta' => 'integer',
            'balance_after' => 'integer',
            'unit_cost' => 'decimal:4',
            'occurred_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
