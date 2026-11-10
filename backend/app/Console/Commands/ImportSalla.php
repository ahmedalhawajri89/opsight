<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Integrations\Backfill;
use App\Domain\Integrations\Salla\SallaConnector;

/**
 * The history a Salla store already had before it connected (ADR-029).
 *
 * Kept under its own name because it is documented and scripted under it.
 * Since ADR-037 it is `opsight:import salla` with the provider filled in.
 */
class ImportSalla extends ImportsFromStores
{
    protected $signature = 'opsight:salla:import
        {from : First day to import, yyyy-mm-dd}
        {to : Last day, inclusive}
        {--business= : One business id; all connected businesses when omitted}
        {--skip-products : Import orders only, leaving the catalogue as it is}
        {--dry-run : Count what would be imported, and write nothing}';

    protected $description = 'Import a date range of orders from each connected Salla store';

    public function handle(SallaConnector $connector, Backfill $backfill): int
    {
        return $this->importFrom($connector, $backfill);
    }
}
