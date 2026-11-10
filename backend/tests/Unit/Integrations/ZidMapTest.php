<?php

declare(strict_types=1);

use App\Domain\Integrations\Zid\ZidMap;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;

/*
|--------------------------------------------------------------------------
| Zid's vocabulary, in this system's terms (ADR-037)
|--------------------------------------------------------------------------
|
| The status list is taken from Zid's List Orders documentation, which names
| statuses in two places that do not agree. Every name from both is mapped.
|
*/

function zidStatus(string $code): OrderStatus
{
    return ZidMap::status(['id' => 1, 'order_status' => ['code' => $code, 'name' => 'x']]);
}

it('does not count an order that was never placed', function (): void {
    // `initial` appears only in Zid's counts, never its filters: a state
    // before the order exists. Revenue for it would be revenue for nothing.
    expect(zidStatus('initial'))->toBe(OrderStatus::Draft);
});

it('counts every committed state as a sale', function (string $code): void {
    expect(zidStatus($code))->toBe(OrderStatus::Confirmed);
})->with(['new', 'preparing', 'ready', 'indelivery']);

it('reads inDelivery the way the webhook conditions spell it', function (): void {
    expect(zidStatus('inDelivery'))->toBe(OrderStatus::Confirmed);
});

it('treats a delivered order, and one only partly returned, as done', function (string $code): void {
    expect(zidStatus($code))->toBe(OrderStatus::Fulfilled);
})->with(['delivered', 'partially_reversed', 'reverse_in_progress']);

it('takes a fully returned order out of revenue', function (string $code): void {
    expect(zidStatus($code))->toBe(OrderStatus::Cancelled);
})->with(['canceled', 'cancelled', 'reversed']);

it('refuses a status it has not been shown, naming the order', function (): void {
    expect(fn () => ZidMap::status(['id' => 4242, 'order_status' => ['code' => 'awaiting_gift_wrap']]))
        ->toThrow(RuntimeException::class, "Zid order 4242 has status 'awaiting_gift_wrap'");
});

it('refuses an order with no status at all', function (): void {
    expect(fn () => ZidMap::status(['id' => 7]))->toThrow(RuntimeException::class, 'no status code');
});

it('maps Zid\'s payment codes, and files an unknown one as other', function (): void {
    expect(ZidMap::paymentMethod('zid_cod'))->toBe(PaymentMethod::CashOnDelivery)
        ->and(ZidMap::paymentMethod('zid_cop'))->toBe(PaymentMethod::Cash)
        ->and(ZidMap::paymentMethod('zid_credit_card'))->toBe(PaymentMethod::Card)
        ->and(ZidMap::paymentMethod('zid_bank_transfer'))->toBe(PaymentMethod::BankTransfer)
        ->and(ZidMap::paymentMethod('a_new_wallet'))->toBe(PaymentMethod::Other)
        ->and(ZidMap::paymentMethod(null))->toBe(PaymentMethod::Other);
});

it('reads a name whether Zid sends a string or a pair of languages', function (): void {
    expect(ZidMap::name('Lamp'))->toBe('Lamp')
        ->and(ZidMap::name(['ar' => 'مصباح', 'en' => 'Lamp']))->toBe('Lamp')
        ->and(ZidMap::name(['ar' => 'مصباح']))->toBe('مصباح')
        ->and(ZidMap::name(['en' => '  ']))->toBeNull()
        ->and(ZidMap::name(null))->toBeNull();
});

it('states the store\'s offset the way Zid\'s date filter writes it', function (): void {
    // '2020-01-01T00:00:00.000+0000' is Zid's own example: no colon.
    expect(ZidMap::utcOffset())->toBe('+0300');
});
