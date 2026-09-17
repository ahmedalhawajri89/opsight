<?php

declare(strict_types=1);

namespace App\Domain\Inventory;

use App\Models\BusinessSetting;
use Illuminate\Contracts\Database\Query\Builder;

/**
 * The one definition of "low stock" that every query uses.
 *
 * A product is low when its stock on hand is at or below its EFFECTIVE
 * threshold: the product's own threshold if it has one, otherwise the
 * inventory row's reorder point if that is set, otherwise the business-wide
 * default. InventoryItem::effectiveThreshold() states the same rule for a
 * single loaded row; this is its SQL twin.
 *
 * Before this class the rule was written four ways — the dashboard count used
 * two of the three steps, and the dashboard list, the inventory filter and the
 * product filter used only the reorder point. So the dashboard could report
 * "3 below reorder point" beside a list of one, and a "view all" link opened a
 * list that disagreed with both.
 *
 * Out of stock is a subset of low: zero or less on hand.
 */
final class StockLevel
{
    /** The effective-threshold expression, for an inventory_items row. */
    public static function thresholdSql(): string
    {
        return 'COALESCE('
            .'(SELECT products.low_stock_threshold FROM products WHERE products.id = inventory_items.product_id), '
            .'NULLIF(inventory_items.reorder_point, 0), '
            .'?)';
    }

    /**
     * Restricts an inventory_items query to rows at or below their threshold.
     *
     * Works on an Eloquent or a base query builder; it only adds a where.
     */
    public static function whereLow(Builder $query): void
    {
        $query->whereRaw(
            'inventory_items.stock_on_hand <= '.self::thresholdSql(),
            [self::defaultThreshold()],
        );
    }

    public static function defaultThreshold(): int
    {
        return (int) BusinessSetting::current()->default_low_stock_threshold;
    }
}
