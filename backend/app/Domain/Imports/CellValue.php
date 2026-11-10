<?php

declare(strict_types=1);

namespace App\Domain\Imports;

use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use Carbon\CarbonImmutable;
use Throwable;

/**
 * Reading one cell of a merchant's spreadsheet (ADR-039).
 *
 * Each reader answers null for "cannot read this", never a guess. The caller
 * turns null into a row error the owner can fix, because an import that
 * silently read "1.234,50" as 1.2345 would be worse than one that refused.
 */
final class CellValue
{
    /**
     * A number as a bcmath string.
     *
     * Arabic-Indic digits, a currency word or symbol, thousands separators
     * and the Arabic decimal mark are all things a person types into a
     * spreadsheet. A comma is a thousands separator unless it is the only
     * separator and is followed by exactly one or two digits ("12,5") — then
     * it is a decimal comma.
     */
    public static function number(string $raw): ?string
    {
        $value = strtr(trim($raw), [
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
            '٫' => '.', '٬' => ',', "\u{00A0}" => '', ' ' => '',
        ]);

        // Currency codes, symbols and words, either side of the figure.
        $value = (string) preg_replace('/[^\d.,\-]/u', '', $value);

        if ($value === '' || $value === '-') {
            return null;
        }

        if (str_contains($value, ',') && ! str_contains($value, '.') && preg_match('/,\d{1,2}$/', $value) === 1 && substr_count($value, ',') === 1) {
            $value = str_replace(',', '.', $value);
        } else {
            $value = str_replace(',', '', $value);
        }

        return is_numeric($value) ? bcadd($value, '0', 4) : null;
    }

    /**
     * A moment, in the business's own zone, returned in UTC.
     *
     * Day first: "05/03/2026" is the fifth of March, as it is everywhere this
     * product sells. ISO dates are read as ISO. An Excel serial number — what
     * a date cell holds when the file is .xlsx — is days since 1899-12-30.
     */
    public static function date(string $raw, string $timezone): ?CarbonImmutable
    {
        $value = trim(strtr($raw, ['٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9']));

        if ($value === '') {
            return null;
        }

        if (preg_match('/^\d{4,5}(\.\d+)?$/', $value) === 1) {
            $serial = (float) $value;

            // 1990–2100 in Excel serials; anything else is not a date.
            if ($serial < 32874 || $serial > 73051) {
                return null;
            }

            $seconds = (int) round(($serial - 25569) * 86400);

            return CarbonImmutable::createFromTimestampUTC($seconds)->shiftTimezone($timezone)->utc();
        }

        $formats = [
            'Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d\TH:i:s', 'Y-m-d\TH:i', 'Y-m-d',
            'd/m/Y H:i:s', 'd/m/Y H:i', 'd/m/Y', 'd-m-Y H:i', 'd-m-Y', 'd.m.Y',
            'Y/m/d H:i', 'Y/m/d',
        ];

        foreach ($formats as $format) {
            try {
                $date = CarbonImmutable::createFromFormat('!'.$format, $value, $timezone);
            } catch (Throwable) {
                continue;
            }

            if ($date !== null && $date->format($format) === $value) {
                return $date->utc();
            }
        }

        // An ISO-8601 moment with its own offset says which zone it is in.
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+\-]\d{2}:?\d{2})$/', $value) === 1) {
            try {
                return CarbonImmutable::parse($value)->utc();
            } catch (Throwable) {
                return null;
            }
        }

        return null;
    }

    /**
     * An order's status from the words stores and people use for it.
     *
     * The line is the importers' line (SallaMap): has the sale been
     * committed? A blank status is a completed sale, because a file of past
     * orders is overwhelmingly a file of sales that happened.
     */
    public static function status(string $raw): ?OrderStatus
    {
        $value = ImportFields::normalise($raw);

        if ($value === '') {
            return OrderStatus::Fulfilled;
        }

        $words = [
            OrderStatus::Draft->value => ['draft', 'pending payment', 'payment pending', 'awaiting payment', 'unpaid draft', 'مسودة', 'بانتظار الدفع', 'في انتظار الدفع'],
            OrderStatus::Confirmed->value => ['confirmed', 'new', 'processing', 'in progress', 'preparing', 'ready', 'shipped', 'in delivery', 'out for delivery', 'pending', 'مؤكد', 'جديد', 'قيد التنفيذ', 'قيد التجهيز', 'جاهز', 'تم الشحن', 'جاري التوصيل', 'قيد التوصيل'],
            OrderStatus::Fulfilled->value => ['fulfilled', 'completed', 'complete', 'delivered', 'done', 'paid', 'closed', 'منفذ', 'مكتمل', 'تم التنفيذ', 'تم التوصيل', 'مدفوع', 'تم'],
            OrderStatus::Cancelled->value => ['cancelled', 'canceled', 'void', 'voided', 'refunded', 'returned', 'ملغي', 'ملغى', 'تم الالغاء', 'مسترجع', 'مرتجع'],
        ];

        foreach ($words as $status => $list) {
            if (in_array($value, array_map(ImportFields::normalise(...), $list), true)) {
                return OrderStatus::from($status);
            }
        }

        return null;
    }

    /** A payment method from what a spreadsheet says; unknown is `other`. */
    public static function paymentMethod(string $raw): PaymentMethod
    {
        $value = ImportFields::normalise($raw);

        return match (true) {
            $value === '' => PaymentMethod::Other,
            str_contains($value, 'delivery') || $value === 'cod' || str_contains($value, 'عند الاستلام') => PaymentMethod::CashOnDelivery,
            str_contains($value, 'cash') || str_contains($value, 'نقد') || str_contains($value, 'كاش') => PaymentMethod::Cash,
            // 'مدي': normalise() has already turned مدى's ى into ي.
            str_contains($value, 'card') || str_contains($value, 'mada') || str_contains($value, 'مدي') || str_contains($value, 'بطاق') || str_contains($value, 'visa') || str_contains($value, 'apple') => PaymentMethod::Card,
            str_contains($value, 'transfer') || str_contains($value, 'bank') || str_contains($value, 'تحويل') => PaymentMethod::BankTransfer,
            str_contains($value, 'wallet') || str_contains($value, 'stc') || str_contains($value, 'tabby') || str_contains($value, 'tamara') || str_contains($value, 'محفظ') => PaymentMethod::Wallet,
            default => PaymentMethod::Other,
        };
    }
}
