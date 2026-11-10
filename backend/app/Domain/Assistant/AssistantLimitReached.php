<?php

declare(strict_types=1);

namespace App\Domain\Assistant;

use RuntimeException;

/** The business has used this month's assistant allowance. */
final class AssistantLimitReached extends RuntimeException {}
