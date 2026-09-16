<?php

declare(strict_types=1);

namespace App\Domain\Orders;

/**
 * The order state machine.
 *
 * Transitions are declared here once, so no controller, service or UI can
 * invent a path through the lifecycle. An illegal transition is a 409, never a
 * silent no-op (MVP_SCOPE.md §6.3).
 *
 *   draft → confirmed → fulfilled
 *   draft | confirmed | fulfilled → cancelled
 *   fulfilled → refunded
 */
enum OrderStatus: string
{
    case Draft = 'draft';
    case Confirmed = 'confirmed';
    case Fulfilled = 'fulfilled';
    case Cancelled = 'cancelled';
    case Refunded = 'refunded';

    /** @return array<int, self> */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::Draft => [self::Confirmed, self::Cancelled],
            self::Confirmed => [self::Fulfilled, self::Cancelled],
            self::Fulfilled => [self::Cancelled, self::Refunded],
            self::Cancelled, self::Refunded => [],
        };
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, $this->allowedTransitions(), strict: true);
    }

    /**
     * Statuses that count toward revenue, COGS, AOV and order counts.
     *
     * `draft` is excluded everywhere — it is a working document, not a
     * commitment. `cancelled` is excluded from every metric except the
     * Cancellation Rate, which needs a different denominator (METRICS.md §1.3).
     *
     * @return array<int, string>
     */
    public static function qualifying(): array
    {
        return [self::Confirmed->value, self::Fulfilled->value, self::Refunded->value];
    }

    /**
     * Every status that had a real commitment, including cancellations.
     *
     * @return array<int, string>
     */
    public static function placed(): array
    {
        return [...self::qualifying(), self::Cancelled->value];
    }

    /** A finalized order is immutable — corrections go through cancel + re-enter. */
    public function isEditable(): bool
    {
        return $this === self::Draft;
    }

    public function holdsStock(): bool
    {
        return in_array($this, [self::Confirmed, self::Fulfilled], strict: true);
    }

    public function label(): string
    {
        return ucfirst($this->value);
    }
}
