<?php

declare(strict_types=1);

use App\Domain\Imports\CellValue;
use App\Domain\Imports\ImportFields;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;

/*
|--------------------------------------------------------------------------
| One cell of a spreadsheet (ADR-039)
|--------------------------------------------------------------------------
*/

it('reads the numbers people actually type', function (string $raw, string $expected): void {
    expect(CellValue::number($raw))->toBe($expected);
})->with([
    ['115.50', '115.5000'],
    ['1,234.50', '1234.5000'],
    ['12,5', '12.5000'],
    ['SAR 99', '99.0000'],
    ['99 ر.س', '99.0000'],
    ['١٢٣٫٥٠', '123.5000'],
    ['-10', '-10.0000'],
]);

it('refuses what is not a number, rather than reading part of it', function (string $raw): void {
    expect(CellValue::number($raw))->toBeNull();
})->with(['', 'n/a', '-', 'free']);

it('reads a date day first, as everywhere this product sells', function (): void {
    // 05/03 is the fifth of March, not the third of May.
    expect(CellValue::date('05/03/2026', 'Asia/Riyadh')?->toIso8601String())->toBe('2026-03-04T21:00:00+00:00');
});

it('reads ISO dates, and times, in the business\'s own zone', function (): void {
    expect(CellValue::date('2026-03-05 14:30', 'Asia/Riyadh')?->toIso8601String())->toBe('2026-03-05T11:30:00+00:00')
        ->and(CellValue::date('2026-03-05T14:30:00Z', 'Asia/Riyadh')?->toIso8601String())->toBe('2026-03-05T14:30:00+00:00');
});

it('reads the serial number an Excel date cell holds', function (): void {
    // 46086 is 2026-03-05 in Excel's calendar.
    expect(CellValue::date('46086', 'Asia/Riyadh')?->toDateString())->toBe('2026-03-04')
        ->and(CellValue::date('46086', 'UTC')?->toDateString())->toBe('2026-03-05');
});

it('refuses a date it would have to guess at', function (string $raw): void {
    expect(CellValue::date($raw, 'Asia/Riyadh'))->toBeNull();
})->with(['31/02/2026', 'March 5', '2026-13-01', '12', 'yesterday']);

it('reads statuses in both languages, and a blank one as a completed sale', function (): void {
    expect(CellValue::status(''))->toBe(OrderStatus::Fulfilled)
        ->and(CellValue::status('Completed'))->toBe(OrderStatus::Fulfilled)
        ->and(CellValue::status('مكتمل'))->toBe(OrderStatus::Fulfilled)
        ->and(CellValue::status('shipped'))->toBe(OrderStatus::Confirmed)
        ->and(CellValue::status('ملغي'))->toBe(OrderStatus::Cancelled)
        ->and(CellValue::status('ملغى'))->toBe(OrderStatus::Cancelled)
        ->and(CellValue::status('awaiting payment'))->toBe(OrderStatus::Draft)
        ->and(CellValue::status('on the moon'))->toBeNull();
});

it('reads payment methods, telling cash on delivery from cash', function (): void {
    expect(CellValue::paymentMethod('Cash on delivery'))->toBe(PaymentMethod::CashOnDelivery)
        ->and(CellValue::paymentMethod('الدفع عند الاستلام'))->toBe(PaymentMethod::CashOnDelivery)
        ->and(CellValue::paymentMethod('cash'))->toBe(PaymentMethod::Cash)
        ->and(CellValue::paymentMethod('مدى'))->toBe(PaymentMethod::Card)
        ->and(CellValue::paymentMethod('Bank transfer'))->toBe(PaymentMethod::BankTransfer)
        ->and(CellValue::paymentMethod('Tabby'))->toBe(PaymentMethod::Wallet)
        ->and(CellValue::paymentMethod('something'))->toBe(PaymentMethod::Other);
});

it('suggests columns from Arabic and English headers alike', function (): void {
    $mapping = ImportFields::suggest('orders', ['رقم الطلب', 'تاريخ الطلب', 'المنتج', 'الكمية', 'سعر الوحدة', 'Order Total']);

    expect($mapping['order_id'])->toBe(0)
        ->and($mapping['date'])->toBe(1)
        ->and($mapping['product_name'])->toBe(2)
        ->and($mapping['quantity'])->toBe(3)
        ->and($mapping['unit_price'])->toBe(4)
        ->and($mapping['order_total'])->toBe(5)
        ->and($mapping['customer_phone'])->toBeNull();
});

it('finds a field inside a longer header, without letting a short word claim another', function (): void {
    $mapping = ImportFields::suggest('orders', ['Order Total', 'Order ID (Salla)', 'Order Date']);

    expect($mapping['order_id'])->toBe(1)
        ->and($mapping['order_total'])->toBe(0)
        ->and($mapping['date'])->toBe(2);
});

it('matches a header typed with a different alif or ta marbuta', function (): void {
    expect(ImportFields::normalise('إجمالي الطلبية'))->toBe(ImportFields::normalise('اجمالي الطلبيه'));
});
