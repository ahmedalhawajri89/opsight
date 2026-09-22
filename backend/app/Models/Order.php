<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\CurrencyAmount;
use App\Domain\Audit\RecordsActivity;
use App\Domain\Orders\OrderStatus;
use App\Observers\AuditObserver;
use Database\Factories\OrderFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $reference
 * @property OrderStatus $status
 * @property Carbon|null $placed_at
 * @property Carbon|null $fulfilled_at
 * @property Carbon|null $cancelled_at
 * @property Carbon|null $refunded_at
 * @property Carbon|null $created_at
 * @property string $subtotal_amount
 * @property string $total_amount
 * @property string $cogs_amount
 */
#[ObservedBy(AuditObserver::class)]
class Order extends Model
{
    /** @use HasFactory<OrderFactory> */
    use HasFactory;

    use RecordsActivity;

    /**
     * Note what is ABSENT: status, placed_at, subtotal_amount, total_amount and
     * cogs_amount. All are integrity-bearing and are written only by the service
     * that owns the operation, never by a request payload (SECURITY.md §6).
     *
     * @var list<string>
     */
    protected $fillable = [
        'customer_id',
        'notes',
        'discount_amount',
        'tax_amount',
        'shipping_amount',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        // decimal casts, never float — money must not touch a PHP float.
        return [
            'status' => OrderStatus::class,
            'placed_at' => 'datetime',
            'fulfilled_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'refunded_at' => 'datetime',
            'refunded_amount' => CurrencyAmount::class,
            'subtotal_amount' => CurrencyAmount::class,
            'discount_amount' => CurrencyAmount::class,
            'tax_amount' => CurrencyAmount::class,
            'shipping_amount' => CurrencyAmount::class,
            'total_amount' => CurrencyAmount::class,
            'cogs_amount' => CurrencyAmount::class,
        ];
    }

    /** @return HasMany<OrderItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Orders that count toward revenue, COGS, AOV and order counts.
     *
     * @param  Builder<Order>  $query
     * @return Builder<Order>
     */
    public function scopeQualifying(Builder $query): Builder
    {
        return $query->whereIn('status', OrderStatus::qualifying());
    }

    /**
     * Ranges on the business date, never on created_at.
     *
     * A draft written in July and confirmed in August is August revenue.
     * Half-open, so the final second of the period is never dropped
     * (METRICS.md §1.2).
     *
     * @param  Builder<Order>  $query
     * @return Builder<Order>
     */
    public function scopePlacedBetween(Builder $query, string $fromUtc, string $toExclusiveUtc): Builder
    {
        return $query->where('placed_at', '>=', $fromUtc)
            ->where('placed_at', '<', $toExclusiveUtc);
    }

    public function isEditable(): bool
    {
        return $this->status->isEditable();
    }
}
