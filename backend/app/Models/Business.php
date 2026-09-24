<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\BusinessFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * A business using Opsight: the unit of isolation (ADR-023).
 *
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property string|null $country
 * @property string $status
 * @property Carbon|null $onboarded_at
 * @property Carbon|null $created_at
 */
class Business extends Model
{
    /** @use HasFactory<BusinessFactory> */
    use HasFactory;

    /**
     * The markets the setup wizard offers: the six Gulf states first, then the
     * expansion markets of the market study (docs/product/MARKET_STUDY.md).
     */
    public const COUNTRIES = ['SA', 'AE', 'BH', 'KW', 'OM', 'QA', 'EG', 'JO', 'MA'];

    /** @var list<string> */
    protected $fillable = ['name', 'slug'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'onboarded_at' => 'datetime',
        ];
    }

    /** @return HasMany<User, $this> */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
