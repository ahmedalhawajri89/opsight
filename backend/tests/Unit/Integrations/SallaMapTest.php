<?php

declare(strict_types=1);

use App\Domain\Integrations\Salla\SallaMap;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;

/*
|--------------------------------------------------------------------------
| What an imported order means to the figures (ADR-029)
|--------------------------------------------------------------------------
|
| Pure translation, so these are unit tests with no database. They are also
| the tests that matter most in the importer: a status mapped one step too
| generously books revenue for an abandoned basket, and nothing downstream
| would notice, because the figures only ever look better.
|
*/

/** @param array<string, mixed> $extra */
function orderWithStatus(string $slug, array $extra = []): array
{
    return array_replace(['id' => 2116149737, 'status' => ['slug' => $slug]], $extra);
}

/*
|--------------------------------------------------------------------------
| Statuses
|--------------------------------------------------------------------------
*/

it('does not book revenue for a basket that was never paid for', function (string $slug): void {
    // The most flattering mistake available to an importer.
    expect(SallaMap::status(orderWithStatus($slug)))->toBe(OrderStatus::Draft);
})->with(['payment_pending', 'waiting_for_payment_confirmation', 'payment_failed']);

it('counts an order the merchant has committed to, paid or not', function (string $slug): void {
    /*
     * Opsight books a confirmed order as revenue and tracks what is owed
     * separately (ADR-022), exactly as it does for a hand-typed order with
     * cash due on delivery. Waiting for the money before counting the sale
     * would make every cash-on-delivery store look empty.
     */
    expect(SallaMap::status(orderWithStatus($slug)))->toBe(OrderStatus::Confirmed);
})->with(['under_review', 'in_progress', 'shipped', 'delivering', 'restoring', 'restored']);

it('treats a delivered order as fulfilled', function (string $slug): void {
    expect(SallaMap::status(orderWithStatus($slug)))->toBe(OrderStatus::Fulfilled);
})->with(['delivered', 'completed']);

it('reads Salla\'s one-L spelling of cancelled', function (): void {
    // A typo here would file cancellations as sales. Both spellings are
    // accepted; Salla's own is `canceled`.
    expect(SallaMap::status(orderWithStatus('canceled')))->toBe(OrderStatus::Cancelled)
        ->and(SallaMap::status(orderWithStatus('cancelled')))->toBe(OrderStatus::Cancelled);
});

it('refuses a status it does not know, rather than guessing a default', function (): void {
    /*
     * A merchant can define custom statuses. Defaulting would file real
     * orders under whatever the default was; refusing leaves the delivery
     * with a reason on it, which is a question someone can answer.
     */
    expect(fn () => SallaMap::status(orderWithStatus('ready_for_pickup')))
        ->toThrow(RuntimeException::class, 'ready_for_pickup');

    // And it names the order, so the operator knows which one to look at.
    expect(fn () => SallaMap::status(orderWithStatus('ready_for_pickup')))
        ->toThrow(RuntimeException::class, '2116149737');
});

it('refuses an order with no status at all', function (): void {
    expect(fn () => SallaMap::status(['id' => 77]))->toThrow(RuntimeException::class, '77');
});

it('knows every status Salla documents', function (): void {
    /*
     * Transcribed from Salla's List Order Statuses page. If Salla adds one,
     * this test still passes and the importer refuses the order loudly —
     * which is the intended order of events: notice, then decide, then map.
     */
    $documented = [
        'payment_pending', 'waiting_for_payment_confirmation', 'payment_failed',
        'in_progress', 'under_review', 'completed', 'delivering', 'delivered',
        'shipped', 'canceled', 'restored', 'restoring',
    ];

    foreach ($documented as $slug) {
        expect(array_key_exists($slug, SallaMap::statuses()))->toBeTrue("'{$slug}' is unmapped");
    }
});

/*
|--------------------------------------------------------------------------
| Payment methods
|--------------------------------------------------------------------------
*/

it('files the Gulf\'s own payment methods under what they actually are', function (string $salla, PaymentMethod $ours): void {
    expect(SallaMap::paymentMethod($salla))->toBe($ours);
})->with([
    // mada is Saudi Arabia's domestic debit scheme: a card, not a category.
    ['mada', PaymentMethod::Card],
    ['credit_card', PaymentMethod::Card],
    ['apple_pay', PaymentMethod::Card],
    // STC Pay is a wallet, as are the instalment providers.
    ['stc_pay', PaymentMethod::Wallet],
    ['tabby', PaymentMethod::Wallet],
    ['customer_wallet', PaymentMethod::Wallet],
    ['bank', PaymentMethod::BankTransfer],
    ['cod', PaymentMethod::CashOnDelivery],
]);

it('does not lose a sale over an unfamiliar wallet', function (): void {
    /*
     * Unlike a status, an unknown payment method does not throw: it is a
     * label on money that has already changed hands, and refusing the order
     * would lose a real sale over a word.
     */
    expect(SallaMap::paymentMethod('some_new_wallet'))->toBe(PaymentMethod::Other)
        ->and(SallaMap::paymentMethod(null))->toBe(PaymentMethod::Other)
        ->and(SallaMap::paymentMethod(''))->toBe(PaymentMethod::Other);
});

it('reads a method whatever its case', function (): void {
    expect(SallaMap::paymentMethod('MADA'))->toBe(PaymentMethod::Card);
});

/*
|--------------------------------------------------------------------------
| Money
|--------------------------------------------------------------------------
*/

it('reads Salla\'s nested amount as a string, never a float', function (): void {
    $amount = SallaMap::money(['amount' => 175.47, 'currency' => 'SAR']);

    expect($amount)->toBeString()->toBe('175.47');
});

it('keeps a whole number whole', function (): void {
    expect(SallaMap::money(['amount' => 186, 'currency' => 'SAR']))->toBe('186');
});

it('reads a bare number as well as a nested one', function (): void {
    expect(SallaMap::money(9.99))->toBe('9.99');
});

it('gives back the default when there is no amount to read', function (): void {
    // Absent shipping is free shipping; absent anything else is the
    // caller's decision, which is why the default has to be passed.
    expect(SallaMap::money([], '0'))->toBe('0')
        ->and(SallaMap::money(null, null))->toBeNull()
        ->and(SallaMap::money(['amount' => 'not a number'], null))->toBeNull();
});

it('does not let a long decimal become a float on the way through', function (): void {
    // 0.1 + 0.2 is why every amount in this system is a string (ADR-015).
    expect(SallaMap::money(['amount' => '0.30']))->toBe('0.3')
        ->and(bcadd(SallaMap::money(['amount' => '0.1']), SallaMap::money(['amount' => '0.2']), 2))->toBe('0.30');
});
