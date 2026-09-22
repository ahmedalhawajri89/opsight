<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use App\Models\Business;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A model whose rows belong to a business (ADR-023).
 *
 * A new row takes the business in context, and a row with no business at all
 * is refused before it reaches the database. Reads are NOT filtered by this
 * trait — that is ScopedToBusiness. Users carry only this one: the sign-in
 * guard must find a user by email before any business is known.
 *
 * @property int $business_id
 */
trait BelongsToBusiness
{
    public static function bootBelongsToBusiness(): void
    {
        static::creating(static function (Model $model): void {
            if ($model->getAttribute('business_id') !== null) {
                return;
            }

            $id = CurrentBusiness::get()->idOrNull();

            if ($id === null && ! static::businessIsOptional()) {
                throw MissingBusinessContext::make();
            }

            $model->setAttribute('business_id', $id);
        });
    }

    /** Only the audit log may hold a row that belongs to no business. */
    protected static function businessIsOptional(): bool
    {
        return false;
    }

    /** @return BelongsTo<Business, $this> */
    public function business(): BelongsTo
    {
        return $this->belongsTo(Business::class);
    }
}
