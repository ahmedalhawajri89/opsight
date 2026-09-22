<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\CurrencyAmount;
use App\Domain\Audit\RecordsActivity;
use App\Observers\AuditObserver;
use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An order line, carrying the snapshots that preserve historical truth.
 *
 * @property string $product_name
 * @property string|null $product_name_ar
 * @property string $product_sku
 * @property string $unit_price
 * @property string $unit_cost
 * @property int $quantity
 * @property string $line_total
 */
#[ObservedBy(AuditObserver::class)]
class OrderItem extends Model
{
    use RecordsActivity;
    use ScopedToBusiness;

    /**
     * The snapshot columns are fillable because the service writes them
     * explicitly at confirm time. `order_id` is absent: a line is always
     * created through the relationship, never pointed at another order.
     *
     * @var list<string>
     */
    protected $fillable = [
        'product_id',
        'product_name',
        'product_name_ar',
        'product_sku',
        'unit_price',
        'unit_cost',
        'quantity',
        'line_discount',
        'line_total',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:4',
            'unit_cost' => 'decimal:4',
            'line_discount' => CurrencyAmount::class,
            'line_total' => CurrencyAmount::class,
            'vat_rate' => 'decimal:2',
            'vat_taxable_amount' => CurrencyAmount::class,
            'vat_amount' => CurrencyAmount::class,
            'quantity' => 'integer',
        ];
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /**
     * Navigation only. Never read for money.
     *
     * @return BelongsTo<Product, $this>
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
