<?php

declare(strict_types=1);

namespace App\Domain\Integrations\WooCommerce;

use App\Domain\Integrations\Import\Amount;
use App\Domain\Integrations\Import\ImportedCustomer;
use App\Domain\Integrations\Import\ImportedLine;
use App\Domain\Integrations\Import\ImportedOrder;
use App\Domain\Integrations\Import\ImportedPayment;
use App\Domain\Integrations\Import\RecordImportedOrder;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use App\Models\Order;
use Illuminate\Support\Carbon;

/**
 * One WooCommerce order, read into the shared ImportedOrder and recorded by
 * the one recorder, as Salla's and Zid's are.
 *
 * MONEY. Each line's `subtotal` is before coupons and `total` after, so the
 * line is recorded at its subtotal and the coupons once, at order level,
 * from `discount_total`. Fees (gift wrap, a payment surcharge) have no line
 * of their own in Baydar; they are carried with shipping so the parts still
 * add up to the order's own total.
 *
 * STATUS. "processing" and "on-hold" are committed trade not yet shipped;
 * "completed" is delivered; "pending" is an unpaid checkout and stays a
 * draft, outside every figure, until the store moves it on.
 *
 * SEVERAL STORES. WooCommerce numbers orders, products and customers per
 * store: order 1042 exists in every shop. The connector marks each payload
 * with the store it came from (`_store`), and every id is recorded under that
 * store, so two shops of one business never fold into each other.
 */
final class ImportWooOrder
{
    public const SOURCE = 'woocommerce';

    /** The key the connector adds to every payload: the store's URL. */
    public const STORE = '_store';

    /**
     * An id as WooCommerce gave it, made unique to its store. The store is
     * shortened to a stable digest of its URL: the URL itself could fill the
     * column, and reconnecting the same store yields the same ids again.
     *
     * @param  array<string, mixed>  $payload
     */
    public static function id(array $payload, string $id): string
    {
        $store = $payload[self::STORE] ?? null;

        return is_string($store) && $store !== '' ? substr(hash('sha256', $store), 0, 12).':'.$id : $id;
    }

    public function __construct(private readonly RecordImportedOrder $record) {}

    /** @param  array<string, mixed>  $payload */
    public function __invoke(array $payload): Order
    {
        return ($this->record)($this->read($payload));
    }

    /** @param  array<string, mixed>  $payload */
    public function read(array $payload): ImportedOrder
    {
        $status = self::status((string) ($payload['status'] ?? 'pending'));
        $lines = [];
        $subtotal = '0';

        foreach ((array) ($payload['line_items'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $quantity = max(1, (int) ($item['quantity'] ?? 1));
            $lineTotal = Amount::of($item['subtotal'] ?? $item['total'] ?? null, '0') ?? '0';
            $subtotal = bcadd($subtotal, $lineTotal, 4);
            $sku = is_string($item['sku'] ?? null) && trim($item['sku']) !== '' ? trim($item['sku']) : null;
            $name = is_string($item['name'] ?? null) && trim($item['name']) !== '' ? trim($item['name']) : null;
            $productId = (int) ($item['variation_id'] ?? 0) ?: (int) ($item['product_id'] ?? 0);

            $lines[] = new ImportedLine(
                productExternalId: $productId > 0 ? self::id($payload, (string) $productId) : null,
                productSku: $sku,
                productName: $name ?? $sku ?? 'WooCommerce item',
                productPrice: bcdiv($lineTotal, (string) $quantity, 4),
                name: $name,
                sku: $sku,
                fallbackName: 'WooCommerce item',
                quantity: $quantity,
                lineTotal: $lineTotal,
                discount: '0',
            );
        }

        $fees = '0';

        foreach ((array) ($payload['fee_lines'] ?? []) as $fee) {
            $fees = bcadd($fees, Amount::of(is_array($fee) ? ($fee['total'] ?? null) : null, '0') ?? '0', 4);
        }

        $discount = Amount::of($payload['discount_total'] ?? null, '0') ?? '0';
        $shipping = bcadd(Amount::of($payload['shipping_total'] ?? null, '0') ?? '0', $fees, 4);
        $tax = Amount::of($payload['total_tax'] ?? null, '0') ?? '0';
        $total = Amount::of($payload['total'] ?? null, null)
            ?? bcsub(bcadd(bcadd($subtotal, $shipping, 4), $tax, 4), $discount, 4);

        return new ImportedOrder(
            source: self::SOURCE,
            externalId: self::id($payload, (string) ($payload['id'] ?? '')),
            status: $status,
            placedAt: Carbon::parse((string) ($payload['date_created_gmt'] ?? $payload['date_created'] ?? 'now'), 'UTC'),
            customer: $this->customer($payload),
            lines: $lines,
            subtotal: $subtotal,
            discount: $discount,
            tax: $tax,
            shipping: $shipping,
            total: $total,
            payments: $this->payments($payload, $status, $total),
            cancellationReason: 'Cancelled in WooCommerce',
            context: ['woocommerce_number' => (string) ($payload['number'] ?? $payload['id'] ?? '')],
        );
    }

    public static function status(string $status): OrderStatus
    {
        return match ($status) {
            'processing', 'on-hold' => OrderStatus::Confirmed,
            'completed' => OrderStatus::Fulfilled,
            'cancelled', 'failed' => OrderStatus::Cancelled,
            'refunded' => OrderStatus::Refunded,
            default => OrderStatus::Draft,
        };
    }

    public static function method(string $gateway): PaymentMethod
    {
        $gateway = strtolower($gateway);

        return match (true) {
            $gateway === 'cod' => PaymentMethod::CashOnDelivery,
            $gateway === 'bacs' => PaymentMethod::BankTransfer,
            str_contains($gateway, 'stripe'), str_contains($gateway, 'card'), str_contains($gateway, 'tap'),
            str_contains($gateway, 'moyasar'), str_contains($gateway, 'checkout'), str_contains($gateway, 'paytabs') => PaymentMethod::Card,
            str_contains($gateway, 'paypal'), str_contains($gateway, 'apple'), str_contains($gateway, 'stc') => PaymentMethod::Wallet,
            default => PaymentMethod::Other,
        };
    }

    /** @param  array<string, mixed>  $payload */
    private function customer(array $payload): ?ImportedCustomer
    {
        $billing = is_array($payload['billing'] ?? null) ? $payload['billing'] : [];
        $name = trim(((string) ($billing['first_name'] ?? '')).' '.((string) ($billing['last_name'] ?? '')));
        $email = is_string($billing['email'] ?? null) && $billing['email'] !== '' ? $billing['email'] : null;

        if ($name === '' && $email === null) {
            return null;
        }

        $id = (int) ($payload['customer_id'] ?? 0);

        return new ImportedCustomer(
            // A guest checkout has no customer id; the email keeps the same
            // buyer together across orders.
            externalId: self::id($payload, $id > 0 ? (string) $id : 'guest:'.strtolower((string) ($email ?? $name))),
            name: $name !== '' ? $name : (string) $email,
            email: $email,
            phone: is_string($billing['phone'] ?? null) && $billing['phone'] !== '' ? $billing['phone'] : null,
            city: is_string($billing['city'] ?? null) && $billing['city'] !== '' ? $billing['city'] : null,
            country: is_string($billing['country'] ?? null) && strlen($billing['country']) === 2 ? strtoupper($billing['country']) : null,
        );
    }

    /**
     * Paid when WooCommerce says so (`date_paid`), or when the order is
     * complete and was not cash on delivery left unrecorded.
     *
     * @param  array<string, mixed>  $payload
     * @return list<ImportedPayment>
     */
    private function payments(array $payload, OrderStatus $status, string $total): array
    {
        $gateway = (string) ($payload['payment_method'] ?? '');
        $paid = ! empty($payload['date_paid']) || ! empty($payload['date_paid_gmt']) || $status === OrderStatus::Fulfilled;

        if (! $paid || ! in_array($status, [OrderStatus::Confirmed, OrderStatus::Fulfilled], true) || bccomp($total, '0', 4) <= 0) {
            return [];
        }

        $title = is_string($payload['payment_method_title'] ?? null) ? $payload['payment_method_title'] : null;

        return [new ImportedPayment(amount: $total, method: self::method($gateway), reference: $title !== '' ? $title : null)];
    }
}
