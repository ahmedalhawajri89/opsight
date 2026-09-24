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
            __('errors.order.illegal_transition', ['from' => $from->label(), 'to' => $to->label()]),
            'order.illegal_transition',
        );
    }

    public static function emptyOrder(): self
    {
        return new self(
            __('errors.order.empty'),
            'order.empty_cannot_confirm',
        );
    }

    public static function notEditable(OrderStatus $status): self
    {
        return new self(
            __('errors.order.not_editable', ['status' => $status->label()]),
            'order.not_editable',
        );
    }

    public static function reasonRequired(): self
    {
        return new self(
            __('errors.order.reason_required'),
            'order.cancellation_reason_required',
        );
    }

    /** A discount may bring an order to nothing, never below it. */
    public static function discountExceedsSubtotal(): self
    {
        return new self(
            __('errors.order.discount_exceeds_subtotal'),
            'order.discount_exceeds_subtotal',
        );
    }

    public static function refundExceedsTotal(): self
    {
        return new self(
            __('errors.order.refund_exceeds_total'),
            'order.refund_exceeds_total',
        );
    }

    /** Stock goes back once per order; a later refund cannot return it again (ADR-022). */
    public static function stockAlreadyReturned(): self
    {
        return new self(
            __('errors.order.stock_already_returned'),
            'order.stock_already_returned',
        );
    }
}
