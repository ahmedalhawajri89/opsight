<?php

declare(strict_types=1);

use App\Domain\Audit\AuditRedactor;

/*
|--------------------------------------------------------------------------
| Audit redaction
|--------------------------------------------------------------------------
|
| SECURITY.md §15.14: an activity_logs diff never contains a redaction-list
| key. This is the test that makes the claim enforceable rather than aspirational,
| and it asserts ABSENCE of the key — not a masked value — because a row reading
| `"password": "[redacted]"` still puts the key in a permanent, append-only
| table that has no delete path.
|
| Every key in the list gets a case, generated from the list itself. Writing
| them out by hand would leave a new key added to KEYS silently untested, which
| is precisely the situation where nobody notices.
|
*/

it('drops every key on the redaction list', function (string $key): void {
    $redactor = new AuditRedactor;

    $clean = $redactor->redact([$key => 'super-secret-value', 'name' => 'Layla']);

    expect($clean)->not->toHaveKey($key)
        ->and($clean)->toBe(['name' => 'Layla']);
})->with(AuditRedactor::KEYS);

it('matches keys case-insensitively', function (): void {
    $clean = (new AuditRedactor)->redact([
        'Password' => 'secret',
        'REMEMBER_TOKEN' => 'secret',
        'Authorization' => 'Bearer secret',
    ]);

    expect($clean)->toBe([]);
});

it('drops a redacted key at any depth', function (): void {
    $clean = (new AuditRedactor)->redact([
        'after' => [
            'email' => 'owner@opsight.test',
            'password' => 'secret',
            'meta' => ['api_token' => 'secret', 'locale' => 'en'],
        ],
    ]);

    expect($clean)->toBe([
        'after' => [
            'email' => 'owner@opsight.test',
            'meta' => ['locale' => 'en'],
        ],
    ]);
});

/*
 * The list holds exact key names, not substrings, and this is the test that
 * pins that choice down. A substring match on "token" would also eat
 * `token_count` — a redaction list that silently destroys real business data
 * is one that gets loosened by the next person who trips over it, and a
 * loosened list is how the password gets through.
 */
it('keeps a business field whose name merely contains a redacted word', function (string $key): void {
    $clean = (new AuditRedactor)->redact([$key => 'kept']);

    expect($clean)->toBe([$key => 'kept']);
})->with([
    'token_count',
    'password_changed_at',
    'secret_santa_budget',
    'cookie_supplier',
]);

it('leaves an unrelated payload untouched', function (): void {
    $payload = [
        'before' => ['price' => '10.0000', 'name' => 'Widget'],
        'after' => ['price' => '12.0000', 'name' => 'Widget'],
    ];

    expect((new AuditRedactor)->redact($payload))->toBe($payload);
});

it('preserves list indices so an array does not become an object', function (): void {
    $clean = (new AuditRedactor)->redact(['statuses' => ['draft', 'confirmed']]);

    expect($clean['statuses'])->toBe(['draft', 'confirmed']);
});
