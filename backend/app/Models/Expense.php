<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\CurrencyAmount;
use App\Domain\Audit\RecordsActivity;
use App\Observers\AuditObserver;
use App\Support\Tenancy\ScopedToBusiness;
use Database\Factories\ExpenseFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * An operating expense.
 *
 * Cost of goods reaches profit through COGS from order_items, never through
 * this table — recording a stock purchase here would double-count it
 * (MVP_SCOPE.md §6.7).
 *
 * @property Carbon $incurred_on
 * @property Carbon|null $created_at
 */
#[ObservedBy(AuditObserver::class)]
class Expense extends Model
{
    /** @use HasFactory<ExpenseFactory> */
    use HasFactory;

    use RecordsActivity;
    use ScopedToBusiness;
    use SoftDeletes;

    /** @var list<string> */
    protected $fillable = [
        'expense_category_id',
        'description',
        'amount',
        'incurred_on',
        'vendor',
        'reference',
        'notes',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'amount' => CurrencyAmount::class,
            // A date, not a datetime. Expense periods compare against local
            // calendar dates with no timezone conversion (METRICS.md §2.9).
            'incurred_on' => 'date',
        ];
    }

    /** @return BelongsTo<ExpenseCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class, 'expense_category_id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * @param  Builder<Expense>  $query
     * @return Builder<Expense>
     */
    public function scopeIncurredBetween(Builder $query, string $from, string $to): Builder
    {
        return $query->whereBetween('incurred_on', [$from, $to]);
    }
}
