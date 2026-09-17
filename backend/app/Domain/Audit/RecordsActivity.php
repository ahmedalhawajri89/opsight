<?php

declare(strict_types=1);

namespace App\Domain\Audit;

use Illuminate\Support\Str;

/**
 * Marks a model as audited and lets the operation that saves it NAME the event.
 *
 * Without this, the observer can only ever write `order.updated` — technically
 * true and useless. "Order 4471 changed status from confirmed to cancelled" and
 * "someone corrected a typo in the notes" are the same row, and the reason for
 * the cancellation has nowhere to live.
 *
 * With it, a domain service says what actually happened:
 *
 *     $order->auditAs('order.cancelled', ['reason' => $reason]);
 *     $order->save();
 *
 * and the observer consumes the override on the next write. The point is that
 * there is still exactly ONE write path to the audit table — the observer —
 * so a new model cannot be added and silently go unlogged. The service
 * supplies the name, not the mechanism.
 */
trait RecordsActivity
{
    /** @var array{action: string, context: array<string, mixed>}|null */
    private ?array $auditOverride = null;

    private bool $auditSuppressed = false;

    /**
     * @param  array<string, mixed>  $context
     */
    public function auditAs(string $action, array $context = []): static
    {
        $this->auditOverride = ['action' => $action, 'context' => $context];

        return $this;
    }

    /**
     * Suppresses auditing for the next write on this instance.
     *
     * The one legitimate use is a write whose audit row is written by a
     * neighbouring operation that describes it better — a stock level moved by
     * the inventory ledger, which already records the movement with its reason.
     * Two rows for one event teaches a reader to distrust the count.
     */
    public function withoutAudit(): static
    {
        $this->auditSuppressed = true;

        return $this;
    }

    public function auditSuppressed(): bool
    {
        return $this->auditSuppressed || ! $this->shouldAudit();
    }

    /**
     * Whether THIS record is worth auditing at all.
     *
     * Overridden by a model whose rows are sometimes a side effect of an
     * operation that is already audited more legibly elsewhere — a stock
     * movement caused by confirming an order, for instance, which the
     * `order.confirmed` row already accounts for by name.
     */
    protected function shouldAudit(): bool
    {
        return true;
    }

    /**
     * @return array{action: string, context: array<string, mixed>}|null
     */
    public function pullAuditOverride(): ?array
    {
        $override = $this->auditOverride;

        // Consumed, so a second save on the same instance does not reuse the
        // first save's reason.
        $this->auditOverride = null;
        $this->auditSuppressed = false;

        return $override;
    }

    /** The `order` in `order.updated`. */
    public function auditSubject(): string
    {
        return Str::snake(class_basename($this));
    }

    /**
     * Attributes excluded from this model's diffs.
     *
     * Distinct from AuditRedactor, which is the security list and applies
     * everywhere. This is per-model noise suppression — a column that changes
     * on every write and means nothing to an auditor.
     *
     * @return list<string>
     */
    public function auditIgnores(): array
    {
        return [];
    }
}
