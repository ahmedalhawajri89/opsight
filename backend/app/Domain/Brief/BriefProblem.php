<?php

declare(strict_types=1);

namespace App\Domain\Brief;

use RuntimeException;

/**
 * A brief that could not be sent, for a reason written for the reader:
 * already translated, safe to show on the settings screen.
 *
 * Anything else a channel throws (an SMTP host refusing, Meta's own error
 * text, a database fault) is for the logs, and the reader is told only that
 * the brief could not be sent. Raw exception messages name hosts, API
 * internals and SQL.
 */
final class BriefProblem extends RuntimeException {}
