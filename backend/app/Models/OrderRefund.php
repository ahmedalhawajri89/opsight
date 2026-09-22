<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\CurrencyAmount;
use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One refund against an order (ADR-022), replacing the single overwritable
 * refund of ADR-005.
 *
 * `amount` is the revenue returned and `vat_amount` the VAT returned with it
 * (ADR-018); `total` is what the customer got back. Written only by
 * RecordRefund, which moves the order's running totals in the same
 * transaction.
 *
 * @property int $id
 * @property int $order_id
 * @property string $amount
 * @property string $vat_amount
 * @property string $total
 * @property bool $returned_stock
 * @property string|null $reason
 * @property Carbon $refunded_at
 * @property int|null $recorded_by
 */
class OrderRefund extends Model
{
    use ScopedToBusiness;

    /** @var list<string> */
    protected $fillable = ['amount', 'vat_amount', 'total', 'returned_stock', 'reason', 'refunded_at', 'recorded_by'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'amount' => CurrencyAmount::class,
            'vat_amount' => CurrencyAmount::class,
            'total' => CurrencyAmount::class,
            'returned_stock' => 'boolean',
            'refunded_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
