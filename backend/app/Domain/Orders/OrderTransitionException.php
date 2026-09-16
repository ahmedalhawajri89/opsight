<?php

declare(strict_types=1);

namespace App\Domain\Orders;

use App\Support\DomainException;

/**
 * An illegal move through the order lifecycle.
 *
 * Carries a stable `code` so the client can branch on the cause rather than
 * parsing a human-readable message (ARCHITECTURE.md §4).
 */
class OrderTransitionException extends DomainException
{
    public static function illegal(OrderStatus $from, OrderStatus $to): self
    {
        return new self(
            "An order cannot move from {$from->value} to {$to->value}.",
            'order.illegal_transition',
        );
    }

    public static function emptyOrder(): self
    {
        return new self(
            'An order cannot be confirmed without at least one item.',
            'order.empty_cannot_confirm',
        );
    }

    public static function notEditable(OrderStatus $status): self
    {
        return new self(
            "A {$status->value} order cannot be edited. Cancel it and enter a correction instead.",
            'order.not_editable',
        );
    }

    public static function reasonRequired(): self
    {
        return new self(
            'A cancellation reason is required.',
            'order.cancellation_reason_required',
        );
    }

    public static function refundExceedsTotal(): self
    {
        return new self(
            'A refund cannot exceed the order total.',
            'order.refund_exceeds_total',
        );
    }
}
