<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

/**
 * Which business this request, command or job is acting for (ADR-023).
 *
 * Bound as a SCOPED instance, so a long-lived worker starts every request and
 * every job with no business, never with the previous one's. It is set from
 * the signed-in user the moment the guard resolves them — before route model
 * binding runs — and explicitly with run() everywhere else.
 */
final class CurrentBusiness
{
    private ?int $id = null;

    public static function get(): self
    {
        return app(self::class);
    }

    /** The business in context; throws when there is none. */
    public function id(): int
    {
        return $this->id ?? throw MissingBusinessContext::make();
    }

    public function idOrNull(): ?int
    {
        return $this->id;
    }

    public function set(int $id): void
    {
        $this->id = $id;
    }

    public function forget(): void
    {
        $this->id = null;
    }

    /**
     * Run a callback as a business, restoring whatever was in context before.
     *
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public function run(int $id, callable $callback): mixed
    {
        $previous = $this->id;
        $this->id = $id;

        try {
            return $callback();
        } finally {
            $this->id = $previous;
        }
    }
}
