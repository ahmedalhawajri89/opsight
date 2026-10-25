<?php

declare(strict_types=1);

namespace App\Domain\Integrations;

use Illuminate\Contracts\Container\Container;

/**
 * Which providers this installation will accept deliveries from (ADR-027).
 *
 * Named in `config/integrations.php` rather than discovered, for the same
 * reason policies and listeners are registered explicitly in this codebase: a
 * convention silently does nothing when a class is renamed, and here "does
 * nothing" means an endpoint that accepts unverifiable POSTs or one that
 * quietly stops existing.
 *
 * Empty today. Phase 6 adds Salla against the contract.
 */
final class WebhookProviders
{
    public function __construct(private readonly Container $container) {}

    public function has(string $name): bool
    {
        return array_key_exists($name, $this->registered());
    }

    public function get(string $name): ?WebhookProvider
    {
        $class = $this->registered()[$name] ?? null;

        if ($class === null) {
            return null;
        }

        $provider = $this->container->make($class);

        return $provider instanceof WebhookProvider ? $provider : null;
    }

    /**
     * The shared secret this provider's deliveries are signed with.
     *
     * From the environment, never the database: it is a deployment secret,
     * not business data, and a business cannot set it (SECURITY.md §12).
     */
    public function secretFor(string $name): ?string
    {
        $secret = config("integrations.secrets.{$name}");

        return is_string($secret) && $secret !== '' ? $secret : null;
    }

    /**
     * The largest delivery body accepted, in bytes.
     *
     * The signature cannot be checked until the body has been read, so the
     * body is the one thing an unauthenticated caller controls for free.
     */
    public function maxPayloadBytes(): int
    {
        return max(1, (int) config('integrations.max_payload_kb', 512)) * 1024;
    }

    /** @return array<string, class-string> */
    private function registered(): array
    {
        /** @var array<string, class-string> $providers */
        $providers = config('integrations.providers', []);

        return $providers;
    }
}
