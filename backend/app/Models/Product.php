<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Audit\RecordsActivity;
use App\Observers\AuditObserver;
use Database\Factories\ProductFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * The catalog.
 *
 * `price` and `cost` are the CURRENT values only. No metric ever reads them —
 * metrics read the snapshot on order_items (MVP_SCOPE.md §5).
 *
 * @property int $id
 * @property string $sku
 * @property string $name
 * @property string $price
 * @property string $cost
 * @property bool $is_active
 * @property int|null $low_stock_threshold
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[ObservedBy(AuditObserver::class)]
class Product extends Model
{
    /** @use HasFactory<ProductFactory> */
    use HasFactory;

    use RecordsActivity;

    use SoftDeletes;

    /**
     * `sku` is absent: it is immutable after creation, so it is set explicitly
     * on create and can never be changed by an update payload.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'description',
        'category_id',
        'price',
        'cost',
        'unit',
        'low_stock_threshold',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        // decimal casts, never float — money must not touch a PHP float.
        return [
            'price' => 'decimal:4',
            'cost' => 'decimal:4',
            'is_active' => 'boolean',
            'low_stock_threshold' => 'integer',
        ];
    }

    /** @return BelongsTo<Category, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /** @return HasOne<InventoryItem, $this> */
    public function inventoryItem(): HasOne
    {
        return $this->hasOne(InventoryItem::class);
    }

    /** @return HasMany<InventoryMovement, $this> */
    public function movements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class);
    }

    /**
     * Order lines referencing this product.
     *
     * For NAVIGATION ONLY. No metric reads money through this relationship.
     *
     * @return HasMany<OrderItem, $this>
     */
    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * @param  Builder<Product>  $query
     * @return Builder<Product>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** True once the product appears on any non-draft order. */
    public function hasSalesHistory(): bool
    {
        return $this->orderItems()
            ->whereHas('order', fn (Builder $query) => $query->where('status', '!=', 'draft'))
            ->exists();
    }
}
