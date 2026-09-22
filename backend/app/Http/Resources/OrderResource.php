<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Authorization\Ability;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentStatus;
use App\Models\Order;
use App\Support\Localization\LocalizedName;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Order
 */
class OrderResource extends JsonResource
{
    /**
     * mergeWhen inserts an int-keyed MergeValue that Laravel flattens after
     * this returns, so the array is genuinely int|string keyed here.
     *
     * @return array<int|string, mixed>
     */
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canSeeMargin = $user?->can(Ability::OrdersViewMargin->value) ?? false;
        $paymentStatus = PaymentStatus::for($this->resource);

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),

            // The business date every metric ranges on — not created_at.
            'placed_at' => $this->placed_at?->toIso8601String(),
            'fulfilled_at' => $this->fulfilled_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'cancellation_reason' => $this->cancellation_reason,
            'refunded_at' => $this->refunded_at?->toIso8601String(),
            // The revenue part of the refund, and the tax part returned with it
            // (ADR-018). What the customer got back is their sum.
            'refunded_amount' => (string) $this->refunded_amount,
            'refunded_vat_amount' => (string) $this->refunded_vat_amount,
            'refunded_total' => bcadd((string) $this->refunded_amount, (string) $this->refunded_vat_amount, Money::scale()),

            'subtotal_amount' => (string) $this->subtotal_amount,
            'discount_amount' => (string) $this->discount_amount,
            'tax_amount' => (string) $this->tax_amount,
            // True when the shelf prices this order was sold at included VAT.
            'prices_include_vat' => (bool) $this->prices_include_vat,
            // Whether tax_amount is rate-backed VAT from the confirm snapshot,
            // or a figure typed in before VAT was switched on. Only with items.
            'vat_applied' => $this->whenLoaded('items', fn (): bool => $this->items->contains(
                fn ($item): bool => bccomp((string) $item->vat_taxable_amount, '0', Money::MAX_SCALE) !== 0,
            )),
            'shipping_amount' => (string) $this->shipping_amount,
            'total_amount' => (string) $this->total_amount,

            // Payment is derived from the ledgers, never stored (ADR-022).
            // Null status for a draft or a cancelled order: it owes nothing.
            'amount_paid' => (string) $this->amount_paid,
            'outstanding_amount' => PaymentStatus::outstanding($this->resource),
            'payment_status' => $paymentStatus?->value,
            'payment_status_label' => $paymentStatus?->label(),
            'refundable_amount' => $this->refundableAmount(),
            'stock_returned' => $this->stock_returned_at !== null,

            'notes' => $this->notes,
            'is_editable' => $this->isEditable(),

            /*
             * Which actions this user may take on THIS order, resolved
             * server-side. The client renders buttons from this list rather
             * than re-deriving the rules, so the two can never disagree.
             */
            'available_actions' => $this->availableActionsFor($request),

            'customer' => $this->whenLoaded('customer', fn (): ?array => $this->customer ? [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
                'display_name' => LocalizedName::pick($this->customer->name, $this->customer->name_ar),
                'email' => $this->customer->email,
            ] : null),

            'items' => OrderItemResource::collection($this->whenLoaded('items')),

            'payments' => $this->whenLoaded('payments', fn (): array => $this->payments->map(fn ($payment): array => [
                'id' => $payment->id,
                'amount' => (string) $payment->amount,
                'method' => $payment->method->value,
                'method_label' => $payment->method->label(),
                'paid_at' => $payment->paid_at->toIso8601String(),
                'reference' => $payment->reference,
                'is_backfill' => (bool) $payment->is_backfill,
            ])->all()),

            'refunds' => $this->whenLoaded('refunds', fn (): array => $this->refunds->map(fn ($refund): array => [
                'id' => $refund->id,
                'amount' => (string) $refund->amount,
                'vat_amount' => (string) $refund->vat_amount,
                'total' => (string) $refund->total,
                'returned_stock' => (bool) $refund->returned_stock,
                'reason' => $refund->reason,
                'refunded_at' => $refund->refunded_at->toIso8601String(),
            ])->all()),

            // COGS and every margin figure are withheld as a set.
            $this->mergeWhen($canSeeMargin, fn (): array => [
                'cogs_amount' => (string) $this->cogs_amount,
                'gross_profit' => bcsub(
                    bcsub((string) $this->subtotal_amount, (string) $this->discount_amount, Money::scale()),
                    (string) $this->cogs_amount,
                    Money::scale(),
                ),
            ]),

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<int, string>
     */
    private function availableActionsFor(Request $request): array
    {
        $user = $request->user();

        if ($user === null) {
            return [];
        }

        $actions = [];

        // Ability AND legality: holding orders.cancel does not make cancelling
        // a draft-only order legal, and vice versa. Both must pass.
        $candidates = [
            'confirm' => [Ability::OrdersConfirm, OrderStatus::Confirmed],
            'fulfil' => [Ability::OrdersFulfil, OrderStatus::Fulfilled],
            'cancel' => [Ability::OrdersCancel, OrderStatus::Cancelled],
            'refund' => [Ability::OrdersRefund, OrderStatus::Refunded],
        ];

        foreach ($candidates as $action => [$ability, $target]) {
            if ($user->can($ability->value) && $this->status->canTransitionTo($target)) {
                $actions[] = $action;
            }
        }

        // A refunded order can take another refund while money is left to
        // return (ADR-022).
        $scale = Money::scale();

        if ($this->status === OrderStatus::Refunded
            && $user->can(Ability::OrdersRefund->value)
            && bccomp($this->refundableAmount(), '0', $scale) > 0) {
            $actions[] = 'refund';
        }

        if ($user->can(Ability::OrdersRecordPayment->value)
            && PaymentStatus::for($this->resource) !== null
            && bccomp(PaymentStatus::outstanding($this->resource), '0', $scale) > 0) {
            $actions[] = 'record_payment';
        }

        return $actions;
    }

    /** What is left to give back: the total, less every refund so far. */
    private function refundableAmount(): string
    {
        $scale = Money::scale();
        $refunded = bcadd((string) $this->refunded_amount, (string) $this->refunded_vat_amount, $scale);

        return bcsub((string) $this->total_amount, $refunded, $scale);
    }
}
