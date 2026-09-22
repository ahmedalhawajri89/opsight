<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Every Eloquent query on a business-owned model reads one business only.
 *
 * Qualified with the table name, so a join to another owned table cannot make
 * the column ambiguous — or quietly bind it to the wrong table.
 */
final class BusinessScope implements Scope
{
    /** @param  Builder<Model>  $builder */
    public function apply(Builder $builder, Model $model): void
    {
        $builder->where($model->qualifyColumn('business_id'), CurrentBusiness::get()->id());
    }
}
