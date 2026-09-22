<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use Illuminate\Auth\EloquentUserProvider;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Finds the signing-in user before any business is known (ADR-023).
 *
 * Users are scoped to a business like every other owned model, which is what
 * keeps one business's owner from listing or editing another's staff. Sign-in
 * is the single place that must look across businesses — by email, which is
 * unique across the installation — and the business is then taken FROM the
 * user it finds. That is the only exemption from the scope, and it is here.
 */
final class BusinessAgnosticUserProvider extends EloquentUserProvider
{
    /**
     * @param  Model|null  $model
     * @return Builder<Model>
     */
    protected function newModelQuery($model = null)
    {
        return parent::newModelQuery($model)->withoutGlobalScope(BusinessScope::class);
    }
}
