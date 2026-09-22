<?php

declare(strict_types=1);

use App\Support\PhoneNumber;

/*
|--------------------------------------------------------------------------
| Phone numbers to E.164 (ADR-021)
|--------------------------------------------------------------------------
*/

it('normalises the ways a number is actually typed', function (string $typed, ?string $country, string $expected): void {
    expect(PhoneNumber::normalize($typed, $country))->toBe($expected);
})->with([
    'Bahraini local, with a space' => ['3600 1234', 'BH', '+97336001234'],
    'already international, punctuated' => ['+973 3600-1234', null, '+97336001234'],
    'international with 00' => ['00966 50 123 4567', null, '+966501234567'],
    'Saudi mobile with its trunk zero' => ['050 123 4567', 'SA', '+966501234567'],
    'Egyptian mobile with its trunk zero' => ['010 1234 5678', 'eg', '+201012345678'],
    'UAE, in brackets and dots' => ['(050) 123.4567', 'AE', '+971501234567'],
]);

it('refuses what it cannot place rather than guessing', function (string $typed, ?string $country): void {
    expect(PhoneNumber::normalize($typed, $country))->toBeNull();
})->with([
    'local number, country unknown' => ['3600 1234', null],
    'local number, country not served' => ['3600 1234', 'FR'],
    'too short' => ['+97312', null],
    'letters' => ['call me', 'BH'],
]);
