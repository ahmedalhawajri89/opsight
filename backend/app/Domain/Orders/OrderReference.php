<?php

declare(strict_types=1);

namespace App\Domain\Orders;

use App\Models\Order;
use App\Support\Tenancy\TenantQuery;
use Illuminate\Database\UniqueConstraintViolationException;
use RuntimeException;

/**
 * Generates the human order identifier: ORD-2026-000418 (OD-6).
 *
 * The sequence restarts each calendar year, which is what makes the reference
 * readable — a six-digit number that never resets becomes meaningless after a
 * few years.
 *
 * Uniqueness is guaranteed by the UNIQUE index, not by this method: two
 * concurrent creates can compute the same next value, so the caller retries on
 * a duplicate-key collision rather than locking the whole table for every draft.
 */
final class OrderReference
{
    private const PREFIX = 'ORD';

    public static function next(): string
    {
        $year = now()->year;
        $prefix = self::PREFIX.'-'.$year.'-';

        $highest = TenantQuery::table('orders')
            ->where('reference', 'like', $prefix.'%')
            ->orderByDesc('reference')
            ->value('reference');

        $sequence = $highest === null
            ? 1
            : ((int) substr($highest, strlen($prefix))) + 1;

        return $prefix.str_pad((string) $sequence, 6, '0', STR_PAD_LEFT);
    }

    /**
     * Create an order, retrying once if a concurrent create took the reference.
     */
    /** @param  array<string, mixed>  $attributes */
    public static function createOrder(array $attributes, ?int $actorId = null): Order
    {
        foreach (range(1, 3) as $attempt) {
            try {
                $order = new Order($attributes);
                $order->reference = self::next();
                $order->status = OrderStatus::Draft;
                $order->created_by = $actorId;
                $order->save();

                return $order;
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt === 3) {
                    throw $e;
                }
            }
        }

        throw new RuntimeException('Could not allocate an order reference.');
    }
}
