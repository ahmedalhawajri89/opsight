<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\CurrencyAmount;
use App\Domain\Payments\PaymentMethod;
use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One payment received against an order (ADR-022).
 *
 * Written only by RecordPayment, in the transaction that also moves the
 * order's amount_paid, so the running total always equals this ledger. Never
 * edited: a mistaken payment is corrected by the order's refund, not by
 * rewriting what was recorded.
 *
 * @property int $id
 * @property int $order_id
 * @property string $amount
 * @property PaymentMethod $method
 * @property Carbon $paid_at
 * @property string|null $reference
 * @property bool $is_backfill
 * @property int|null $recorded_by
 */
class OrderPayment extends Model
{
    use ScopedToBusiness;

    /** @var list<string> */
    protected $fillable = ['amount', 'method', 'paid_at', 'reference', 'recorded_by'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'amount' => CurrencyAmount::class,
            'method' => PaymentMethod::class,
            'paid_at' => 'datetime',
            'is_backfill' => 'boolean',
        ];
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
