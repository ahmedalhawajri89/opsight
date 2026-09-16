<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| Feature tests hit the real MySQL/MariaDB test schema (see phpunit.xml).
| RefreshDatabase wraps each test in a transaction and rolls it back.
|
| Unit tests get no database, so they stay fast and stay honest about being
| pure logic.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

pest()->extend(TestCase::class)
    ->in('Unit');

/*
 * Concurrency tests get a database but NOT RefreshDatabase.
 *
 * RefreshDatabase wraps each test in a transaction on one connection, which a
 * second connection cannot see into — and seeing across connections is exactly
 * what these tests are for. They commit real rows and clean up after
 * themselves.
 */
pest()->extend(TestCase::class)
    ->in('Concurrency');
