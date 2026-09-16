<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\CustomerFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * Deliberately WITHOUT total_orders, total_spent or first_order_at.
 *
 * Every one of those is a metric derived from orders, and storing it creates a
 * second source of truth that goes wrong the first time an order is cancelled
 * or backdated (DATABASE_DESIGN.md §3.5).
 *
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class Customer extends Model
{
    /** @use HasFactory<CustomerFactory> */
    use HasFactory;

    use SoftDeletes;

    /** @var list<string> */
    protected $fillable = [
        'name',
        'email',
        'phone',
        'company',
        'address_line',
        'city',
        'country',
        'notes',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    /** @return HasMany<Order, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    /**
     * @param  Builder<Customer>  $query
     * @return Builder<Customer>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * A customer with committed orders is never hard-deleted — removing them
     * must not rewrite history (MVP_SCOPE.md §6.4).
     */
    public function hasOrderHistory(): bool
    {
        return $this->orders()->where('status', '!=', 'draft')->exists();
    }
}
