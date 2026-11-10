<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Integrations\Backfill;
use App\Domain\Integrations\Connectors;

/**
 * The history a connected store already had, for any registered provider
 * (ADR-037).
 */
class ImportStores extends ImportsFromStores
{
    protected $signature = 'opsight:import
        {provider : salla, zid — any connector named in config/integrations.php}
        {from : First day to import, yyyy-mm-dd}
        {to : Last day, inclusive}
        {--business= : One business id; all connected businesses when omitted}
        {--skip-products : Import orders only, leaving the catalogue as it is}
        {--dry-run : Count what would be imported, and write nothing}';

    protected $description = 'Import a date range of orders from each connected store of one provider';

    public function handle(Connectors $connectors, Backfill $backfill): int
    {
        $provider = (string) $this->argument('provider');
        $connector = $connectors->get($provider);

        if ($connector === null) {
            $known = implode(', ', $connectors->names()) ?: 'none';
            $this->components->error("No connector is registered as '{$provider}'. Registered: {$known}.");

            return self::FAILURE;
        }

        return $this->importFrom($connector, $backfill);
    }
}
