<?php

declare(strict_types=1);

namespace App\Observers;

use App\Domain\Audit\AuditRecorder;
use Illuminate\Database\Eloquent\Model;

/**
 * Writes an audit row for every create, update and delete of source data.
 *
 * An observer rather than a call in each controller, because the requirement is
 * "every write is audited" and a per-controller call is satisfied only until
 * someone adds a controller. Attached via #[ObservedBy] on the model, so the
 * model itself declares that it is audited and the declaration travels with it.
 *
 * Reads are NOT logged. High volume, low value, and an audit log in which every
 * list view appears buries the twelve rows that matter under twelve thousand
 * that do not (SECURITY.md §10).
 */
class AuditObserver
{
    public function __construct(private readonly AuditRecorder $recorder) {}

    public function created(Model $model): void
    {
        $override = $this->override($model);

        if ($override === false) {
            return;
        }

        $this->recorder->record(
            action: $override['action'] ?? $this->action($model, 'created'),
            subject: $model,

            // The created attributes ARE the change. There is no before.
            changes: ['before' => [], 'after' => $this->attributes($model)],
            context: $override['context'] ?? null,
        );
    }

    public function updated(Model $model): void
    {
        $override = $this->override($model);

        if ($override === false) {
            return;
        }

        $diff = $this->recorder->diff($model);
        $diff = $diff === null ? null : $this->filter($model, $diff);

        /*
         * Nothing meaningful moved — only timestamps, or only ignored columns.
         * An override is still honoured, because a service that named the event
         * is asserting it happened even if no column it cares about moved.
         */
        if ($diff === null && $override === null) {
            return;
        }

        $this->recorder->record(
            action: $override['action'] ?? $this->action($model, 'updated'),
            subject: $model,
            changes: $diff,
            context: $override['context'] ?? null,
        );
    }

    public function deleted(Model $model): void
    {
        $override = $this->override($model);

        if ($override === false) {
            return;
        }

        /*
         * Soft deletes report as `deleted` too, which is correct: from the
         * business side the record is gone. The context distinguishes them, so
         * an auditor can tell whether it is recoverable.
         */
        $soft = method_exists($model, 'trashed');

        $this->recorder->record(
            action: $override['action'] ?? $this->action($model, 'deleted'),
            subject: $model,
            changes: null,
            context: ($override['context'] ?? []) + ['soft_delete' => $soft],
        );
    }

    /**
     * @return array{action?: string, context?: array<string, mixed>}|false|null
     */
    private function override(Model $model): array|false|null
    {
        if (! method_exists($model, 'pullAuditOverride')) {
            return null;
        }

        $suppressed = method_exists($model, 'auditSuppressed') && $model->auditSuppressed();
        $override = $model->pullAuditOverride();

        return $suppressed ? false : $override;
    }

    private function action(Model $model, string $verb): string
    {
        $subject = method_exists($model, 'auditSubject')
            ? $model->auditSubject()
            : mb_strtolower(class_basename($model));

        return $subject.'.'.$verb;
    }

    /**
     * @return array<string, mixed>
     */
    private function attributes(Model $model): array
    {
        $attributes = $model->getAttributes();

        foreach ($this->ignored($model) as $key) {
            unset($attributes[$key]);
        }

        unset($attributes['created_at'], $attributes['updated_at']);

        return $attributes;
    }

    /**
     * @param  array{before: array<string, mixed>, after: array<string, mixed>}  $diff
     * @return array{before: array<string, mixed>, after: array<string, mixed>}|null
     */
    private function filter(Model $model, array $diff): ?array
    {
        foreach ($this->ignored($model) as $key) {
            unset($diff['before'][$key], $diff['after'][$key]);
        }

        return $diff['after'] === [] ? null : $diff;
    }

    /**
     * @return list<string>
     */
    private function ignored(Model $model): array
    {
        return method_exists($model, 'auditIgnores') ? $model->auditIgnores() : [];
    }
}
