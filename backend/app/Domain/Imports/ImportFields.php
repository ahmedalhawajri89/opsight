<?php

declare(strict_types=1);

namespace App\Domain\Imports;

/**
 * What each kind of file can say, and how its columns are recognised
 * (ADR-039).
 *
 * The header names are the ones merchants' exports actually use — Salla's
 * and Zid's own order exports, an accountant's spreadsheet, and the Arabic
 * an owner types when they build one by hand. A suggestion is only that:
 * the owner sees every mapping before anything is written and can change it.
 */
final class ImportFields
{
    public const KINDS = ['orders', 'products'];

    /**
     * field => [required, recognised header names]
     *
     * ORDERS ARE ONE ROW PER LINE, the shape every store export uses: an
     * order with three products is three rows sharing an order number. The
     * order-level columns (date, customer, shipping, total) are read from
     * the first row of each order.
     *
     * @return array<string, array{required: bool, headers: list<string>}>
     */
    public static function for(string $kind): array
    {
        return match ($kind) {
            'products' => [
                'sku' => ['required' => true, 'headers' => ['sku', 'product code', 'item code', 'code', 'barcode', 'رمز المنتج', 'الرمز', 'كود', 'الباركود', 'sku المنتج']],
                'name' => ['required' => true, 'headers' => ['name', 'product name', 'product', 'item', 'title', 'اسم المنتج', 'المنتج', 'الاسم', 'الصنف']],
                'price' => ['required' => true, 'headers' => ['price', 'selling price', 'sale price', 'unit price', 'السعر', 'سعر البيع']],
                'cost' => ['required' => false, 'headers' => ['cost', 'cost price', 'purchase price', 'unit cost', 'التكلفة', 'سعر التكلفة', 'سعر الشراء']],
            ],
            default => [
                'order_id' => ['required' => true, 'headers' => ['order id', 'order number', 'order no', 'order #', 'order', 'reference', 'invoice number', 'invoice no', 'رقم الطلب', 'الطلب', 'رقم الفاتورة', 'المرجع']],
                'date' => ['required' => true, 'headers' => ['date', 'order date', 'created at', 'created', 'placed at', 'invoice date', 'التاريخ', 'تاريخ الطلب', 'تاريخ الفاتورة']],
                'status' => ['required' => false, 'headers' => ['status', 'order status', 'الحالة', 'حالة الطلب']],
                'sku' => ['required' => false, 'headers' => ['sku', 'product code', 'item code', 'رمز المنتج', 'الرمز', 'كود المنتج']],
                'product_name' => ['required' => false, 'headers' => ['product', 'product name', 'item', 'item name', 'description', 'المنتج', 'اسم المنتج', 'الصنف', 'البيان']],
                'quantity' => ['required' => false, 'headers' => ['quantity', 'qty', 'units', 'الكمية', 'العدد']],
                'unit_price' => ['required' => false, 'headers' => ['unit price', 'price', 'item price', 'سعر الوحدة', 'السعر']],
                'line_total' => ['required' => false, 'headers' => ['line total', 'item total', 'subtotal', 'amount', 'إجمالي البند', 'المبلغ', 'الإجمالي الفرعي']],
                'customer_name' => ['required' => false, 'headers' => ['customer', 'customer name', 'client', 'buyer', 'العميل', 'اسم العميل', 'الزبون']],
                'customer_phone' => ['required' => false, 'headers' => ['phone', 'mobile', 'customer phone', 'customer mobile', 'الجوال', 'الهاتف', 'رقم الجوال', 'جوال العميل']],
                'customer_email' => ['required' => false, 'headers' => ['email', 'customer email', 'e-mail', 'البريد', 'البريد الإلكتروني']],
                'shipping' => ['required' => false, 'headers' => ['shipping', 'shipping cost', 'delivery', 'delivery fee', 'الشحن', 'تكلفة الشحن', 'رسوم التوصيل']],
                'tax' => ['required' => false, 'headers' => ['tax', 'vat', 'tax amount', 'الضريبة', 'ضريبة القيمة المضافة']],
                'discount' => ['required' => false, 'headers' => ['discount', 'discount amount', 'coupon', 'الخصم', 'قيمة الخصم']],
                'order_total' => ['required' => false, 'headers' => ['total', 'order total', 'grand total', 'total amount', 'الإجمالي', 'إجمالي الطلب', 'المجموع']],
                'payment_method' => ['required' => false, 'headers' => ['payment method', 'payment', 'paid by', 'طريقة الدفع', 'الدفع']],
            ],
        };
    }

    /**
     * Which column each field most likely is, by header name.
     *
     * Exact matches first, so "price" goes to unit price rather than being
     * taken by a column called "price total". A column is used once.
     *
     * @param  list<string>  $headers
     * @return array<string, int|null> field => column index
     */
    public static function suggest(string $kind, array $headers): array
    {
        $normalised = array_map(self::normalise(...), $headers);
        $taken = [];
        $mapping = [];

        foreach (self::for($kind) as $field => $definition) {
            $mapping[$field] = null;

            foreach ($definition['headers'] as $name) {
                $index = array_search(self::normalise($name), $normalised, true);

                if ($index !== false && ! in_array($index, $taken, true)) {
                    $mapping[$field] = (int) $index;
                    $taken[] = (int) $index;
                    break;
                }
            }
        }

        /*
         * Then whole words inside a longer header — "Order ID (Salla)",
         * "تاريخ الطلب الميلادي" — for the fields still unplaced. Only names
         * of two words or more, so "order" alone does not claim "order total".
         */
        foreach (self::for($kind) as $field => $definition) {
            if ($mapping[$field] !== null) {
                continue;
            }

            foreach ($definition['headers'] as $name) {
                $needle = self::normalise($name);

                if (! str_contains($needle, ' ')) {
                    continue;
                }

                foreach ($normalised as $index => $header) {
                    if (! in_array($index, $taken, true) && preg_match('/(^|\s|\()'.preg_quote($needle, '/').'($|\s|\))/u', $header) === 1) {
                        $mapping[$field] = $index;
                        $taken[] = $index;

                        continue 3;
                    }
                }
            }
        }

        return $mapping;
    }

    /** Case, spacing, underscores and Arabic letter variants do not decide a match. */
    public static function normalise(string $header): string
    {
        $header = mb_strtolower(trim($header));
        $header = str_replace(['_', '-', '.', ':'], ' ', $header);
        // أ إ آ → ا, ة → ه, ى → ي: the same word typed on different keyboards.
        $header = strtr($header, ['أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ة' => 'ه', 'ى' => 'ي']);

        return (string) preg_replace('/\s+/u', ' ', $header);
    }
}
