<?php

declare(strict_types=1);

namespace App\Domain\Assistant;

use RuntimeException;

/**
 * A tool call the model got wrong — a malformed date, an option that does
 * not exist. Returned to the model as an error result so it can correct the
 * call, rather than failing the owner's question.
 */
final class AssistantToolError extends RuntimeException {}
