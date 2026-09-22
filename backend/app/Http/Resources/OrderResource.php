<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Authorization\Ability;
use App\Domain\Orders\OrderStatus;
use App\Models\Order;
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
            'refunded_amount' => (string) $this->refunded_amount,

            'subtotal_amount' => (string) $this->subtotal_amount,
            'discount_amount' => (string) $this->discount_amount,
            'tax_amount' => (string) $this->tax_amount,
            'shipping_amount' => (string) $this->shipping_amount,
            'total_amount' => (string) $this->total_amount,

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
                'email' => $this->customer->email,
            ] : null),

            'items' => OrderItemResource::collection($this->whenLoaded('items')),

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

        return $actions;
    }
}
