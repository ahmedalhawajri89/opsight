<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use RuntimeException;

/**
 * Zid said no, in a way that asking again will not change: a used or
 * expired code, a revoked refresh token, a removed app. The message is
 * Zid's own words, because they are what a support conversation needs.
 */
final class ZidRefused extends RuntimeException {}
