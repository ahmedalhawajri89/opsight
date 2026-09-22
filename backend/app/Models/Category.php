<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Audit\RecordsActivity;
use App\Observers\AuditObserver;
use App\Support\Tenancy\ScopedToBusiness;
use Database\Factories\CategoryFactory;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * @property string $name
 * @property string|null $name_ar
 * @property Carbon|null $created_at
 */
#[ObservedBy(AuditObserver::class)]
class Category extends Model
{
    /** @use HasFactory<CategoryFactory> */
    use HasFactory;

    use RecordsActivity;
    use ScopedToBusiness;
    use SoftDeletes;

    /** @var list<string> */
    protected $fillable = ['name', 'name_ar', 'slug', 'description'];

    /** @return HasMany<Product, $this> */
    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
