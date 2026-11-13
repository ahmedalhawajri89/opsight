<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Shopify;

use App\Domain\Integrations\Import\Amount;
use App\Domain\Integrations\Import\ImportedLine;
use App\Domain\Integrations\Import\ImportedOrder;
use App\Domain\Integrations\Import\ImportedPayment;
use App\Domain\Integrations\Import\RecordImportedOrder;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use App\Models\Order;
use Illuminate\Support\Carbon;

/**
 * One Shopify order, read into the shared ImportedOrder.
 *
 * MONEY. Lines at their original unit price, discounts once at order level.
 * When the shop's prices include tax, the tax is already inside the line
 * prices and is not added again, so the parts still add up to Shopify's own
 * total.
 *
 * STATUS. Cancelled when Shopify says it was cancelled; refunded when fully
 * refunded; fulfilled when every item shipped; otherwise a confirmed order
 * still to ship. Shopify has no draft orders in this list (drafts are a
 * separate object), so nothing here is left out of the figures.
 *
 * PAID is what Shopify has collected: the total less what is outstanding.
 */
final class ImportShopifyOrder
{
    public const SOURCE = 'shopify';

    public function __construct(private readonly RecordImportedOrder $record) {}

    /** @param  array<string, mixed>  $payload */
    public function __invoke(array $payload): Order
    {
        return ($this->record)($this->read($payload));
    }

    /** @param  array<string, mixed>  $payload */
    public function read(array $payload): ImportedOrder
    {
        $lines = [];
        $subtotal = '0';

        foreach ((array) ($payload['lineItems']['nodes'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $quantity = max(1, (int) ($item['quantity'] ?? 1));
            $unit = self::money($item['originalUnitPriceSet'] ?? null);
            $lineTotal = bcmul($unit, (string) $quantity, 4);
            $subtotal = bcadd($subtotal, $lineTotal, 4);
            $sku = is_string($item['sku'] ?? null) && trim($item['sku']) !== '' ? trim($item['sku']) : null;
            $name = is_string($item['name'] ?? null) && trim($item['name']) !== '' ? trim($item['name']) : null;
            $variant = $item['variant']['legacyResourceId'] ?? null;

            $lines[] = new ImportedLine(
                productExternalId: is_scalar($variant) && (string) $variant !== '' ? (string) $variant : null,
                productSku: $sku,
                productName: $name ?? $sku ?? 'Shopify item',
                productPrice: $unit,
                name: $name,
                sku: $sku,
                fallbackName: 'Shopify item',
                quantity: $quantity,
                lineTotal: $lineTotal,
                discount: '0',
            );
        }

        $status = self::status($payload);
        $discount = self::money($payload['totalDiscountsSet'] ?? null);
        $shipping = self::money($payload['totalShippingPriceSet'] ?? null);
        $tax = ($payload['taxesIncluded'] ?? false) ? '0' : self::money($payload['totalTaxSet'] ?? null);
        $total = self::money($payload['totalPriceSet'] ?? null);
        $outstanding = self::money($payload['totalOutstandingSet'] ?? null);
        $paid = bcsub($total, $outstanding, 4);

        $payments = [];

        if (in_array($status, [OrderStatus::Confirmed, OrderStatus::Fulfilled], true) && bccomp($paid, '0', 4) > 0) {
            $gateway = (string) (((array) ($payload['paymentGatewayNames'] ?? []))[0] ?? '');
            $payments[] = new ImportedPayment(amount: $paid, method: self::method($gateway), reference: $gateway !== '' ? $gateway : null);
        }

        return new ImportedOrder(
            source: self::SOURCE,
            externalId: (string) ($payload['legacyResourceId'] ?? $payload['id'] ?? ''),
            status: $status,
            placedAt: Carbon::parse((string) ($payload['createdAt'] ?? 'now'), 'UTC'),
            customer: null,
            lines: $lines,
            subtotal: $subtotal,
            discount: $discount,
            tax: $tax,
            shipping: $shipping,
            total: $total,
            payments: $payments,
            cancellationReason: 'Cancelled in Shopify',
            context: ['shopify_name' => (string) ($payload['name'] ?? '')],
        );
    }

    /** @param  array<string, mixed>  $payload */
    public static function status(array $payload): OrderStatus
    {
        if (! empty($payload['cancelledAt'])) {
            return OrderStatus::Cancelled;
        }

        if (($payload['displayFinancialStatus'] ?? null) === 'REFUNDED') {
            return OrderStatus::Refunded;
        }

        return ($payload['displayFulfillmentStatus'] ?? null) === 'FULFILLED'
            ? OrderStatus::Fulfilled
            : OrderStatus::Confirmed;
    }

    public static function method(string $gateway): PaymentMethod
    {
        $gateway = strtolower($gateway);

        return match (true) {
            str_contains($gateway, 'cash on delivery'), $gateway === 'cod' => PaymentMethod::CashOnDelivery,
            str_contains($gateway, 'bank') => PaymentMethod::BankTransfer,
            str_contains($gateway, 'paypal'), str_contains($gateway, 'apple'), str_contains($gateway, 'shop_pay') => PaymentMethod::Wallet,
            str_contains($gateway, 'shopify_payments'), str_contains($gateway, 'stripe'), str_contains($gateway, 'card'), str_contains($gateway, 'tap') => PaymentMethod::Card,
            $gateway === 'manual' => PaymentMethod::Other,
            default => PaymentMethod::Other,
        };
    }

    private static function money(mixed $set): string
    {
        $amount = is_array($set) ? ($set['shopMoney']['amount'] ?? null) : null;

        return Amount::of($amount, '0') ?? '0';
    }
}
