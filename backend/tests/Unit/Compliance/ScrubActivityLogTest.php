<?php

declare(strict_types=1);

use App\Domain\Compliance\ScrubActivityLog;

/*
|--------------------------------------------------------------------------
| Scrubbing a person out of the audit log, without scrubbing the audit
|--------------------------------------------------------------------------
|
| Pure array in, array out — no database, so these run in milliseconds and the
| shape rules are stated where they are easiest to read (ADR-026).
|
*/

beforeEach(function (): void {
    $this->scrub = new ScrubActivityLog;
});

/*
|--------------------------------------------------------------------------
| byKey — the targeted pass
|--------------------------------------------------------------------------
*/

it('replaces the value and KEEPS the key', function (): void {
    /*
     * The inverse of AuditRedactor's rule, and the whole point. "Someone
     * changed this customer's email in March" must stay true after the
     * erasure; only the address goes. Dropping the key would erase the
     * accountability with the data.
     */
    $scrubbed = $this->scrub->byKey(['email' => 'khalid@example.test', 'city' => 'Manama'], ['email']);

    expect($scrubbed)->toHaveKey('email')
        ->and($scrubbed['email'])->toBe('[erased]')
        ->and($scrubbed['city'])->toBe('Manama');
});

it('reaches into the before and after of a diff', function (): void {
    $changes = [
        'before' => ['email' => 'old@example.test', 'notes' => 'Prefers morning delivery'],
        'after' => ['email' => 'new@example.test', 'notes' => 'Prefers evening delivery'],
    ];

    $scrubbed = $this->scrub->byKey($changes, ['email', 'notes']);

    expect($scrubbed['before']['email'])->toBe('[erased]')
        ->and($scrubbed['after']['email'])->toBe('[erased]')
        ->and($scrubbed['before']['notes'])->toBe('[erased]')
        ->and($scrubbed['after']['notes'])->toBe('[erased]');
});

it('leaves a null alone, because an empty field held nothing about anyone', function (): void {
    $scrubbed = $this->scrub->byKey(['before' => ['phone' => null], 'after' => ['phone' => '+97333001122']], ['phone']);

    expect($scrubbed['before']['phone'])->toBeNull()
        ->and($scrubbed['after']['phone'])->toBe('[erased]');
});

it('passes a null payload straight through', function (): void {
    // customer.deleted carries no diff at all.
    expect($this->scrub->byKey(null, ['email']))->toBeNull();
});

it('does not touch a key that merely resembles one on the list', function (): void {
    $scrubbed = $this->scrub->byKey(['email_verified_at' => '2026-01-01', 'email' => 'a@b.test'], ['email']);

    expect($scrubbed['email_verified_at'])->toBe('2026-01-01')
        ->and($scrubbed['email'])->toBe('[erased]');
});

/*
|--------------------------------------------------------------------------
| byValue — the sweep for rows with no subject
|--------------------------------------------------------------------------
*/

it('reaches a search term buried in an export row', function (): void {
    // The real case: a colleague exported the customer list after typing this
    // person's email into the filter. No subject_id points at that row.
    $context = ['resource' => 'customers', 'filters' => ['search' => 'khalid@alnoor-customers.test']];

    $scrubbed = $this->scrub->byValue($context, ['khalid@alnoor-customers.test']);

    expect($scrubbed['filters']['search'])->toBe('[erased]')
        ->and($scrubbed['resource'])->toBe('customers');
});

it('replaces a needle sitting inside a longer sentence', function (): void {
    $scrubbed = $this->scrub->byValue(
        ['note' => 'Called +97333001122 twice, no answer'],
        ['+97333001122'],
    );

    expect($scrubbed['note'])->toBe('Called [erased] twice, no answer');
});

it('round-trips Arabic text it is not asked to touch', function (): void {
    $scrubbed = $this->scrub->byValue(
        ['description' => 'صينية تمر هدية', 'email' => 'khalid@example.test'],
        ['khalid@example.test'],
    );

    expect($scrubbed['description'])->toBe('صينية تمر هدية')
        ->and($scrubbed['email'])->toBe('[erased]');
});

it('leaves non-strings as they are', function (): void {
    $scrubbed = $this->scrub->byValue(['count' => 12, 'ok' => true, 'ratio' => 1.5], ['anything']);

    expect($scrubbed['count'])->toBe(12)
        ->and($scrubbed['ok'])->toBeTrue()
        ->and($scrubbed['ratio'])->toBe(1.5);
});

it('does nothing at all when there is nothing to look for', function (): void {
    $payload = ['filters' => ['search' => 'Ali']];

    expect($this->scrub->byValue($payload, []))->toBe($payload);
});

/*
|--------------------------------------------------------------------------
| needles — what the sweep is allowed to look for
|--------------------------------------------------------------------------
*/

it('never sweeps for the name, however the rest is scrubbed', function (): void {
    /*
     * A customer called "Ali" would have that substring struck out of "Alia
     * Trading" in rows belonging to other people. The targeted pass already
     * covers every row naming this customer, so excluding the name trades a
     * bounded, documented gap for not corrupting unrelated history.
     */
    $needles = $this->scrub->needles([
        'name' => 'Khalid Al Mutairi',
        'email' => 'khalid@example.test',
    ]);

    expect($needles)->toBe(['khalid@example.test']);
});

it('skips a needle too short to be distinctive', function (): void {
    $needles = $this->scrub->needles(['phone' => '12345', 'email' => 'khalid@example.test']);

    expect($needles)->toBe(['khalid@example.test']);
});

it('collects every long identifier the customer held, without duplicates', function (): void {
    $needles = $this->scrub->needles([
        'email' => 'khalid@example.test',
        'phone' => '+97333001122',
        'vat_number' => '200000000000003',
        'address_line' => 'Building 123, Road 456, Manama',
        'city' => 'Manama',
        'company' => 'Al Noor Trading',
    ]);

    // City and company are cleared on the customer, but are not swept for:
    // both are shared by other records in a small market.
    expect($needles)->toBe([
        'khalid@example.test',
        '+97333001122',
        '200000000000003',
        'Building 123, Road 456, Manama',
    ]);
});

it('copes with a customer who gave almost nothing', function (): void {
    expect($this->scrub->needles(['email' => null, 'phone' => null]))->toBe([]);
});
