<?php

declare(strict_types=1);

namespace App\Domain\Integrations;

use Illuminate\Contracts\Container\Container;

/**
 * The stores this installation can import from (ADR-037).
 *
 * Named in `config/integrations.php`, like the webhook providers, rather than
 * discovered: a convention silently does nothing when a class is renamed.
 */
final class Connectors
{
    public function __construct(private readonly Container $container) {}

    public function get(string $provider): ?Connector
    {
        $class = $this->registered()[$provider] ?? null;

        if ($class === null) {
            return null;
        }

        $connector = $this->container->make($class);

        return $connector instanceof Connector ? $connector : null;
    }

    /** @return list<string> */
    public function names(): array
    {
        return array_keys($this->registered());
    }

    /** @return array<string, class-string> */
    private function registered(): array
    {
        /** @var array<string, class-string> $connectors */
        $connectors = config('integrations.connectors', []);

        return $connectors;
    }
}
