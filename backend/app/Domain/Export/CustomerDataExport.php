<?php

declare(strict_types=1);

namespace App\Domain\Export;

use App\Authorization\Ability;
use App\Domain\Audit\AuditRecorder;
use App\Http\Resources\ActivityLogResource;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\OrderResource;
use App\Models\ActivityLog;
use App\Models\BusinessSetting;
use App\Models\Customer;
use App\Support\Localization\Localizer;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Everything the system holds about one person, as JSON (ADR-026).
 *
 * A SEPARATE CLASS FROM `CsvExport`, and not a failure to reuse it. That one
 * is shaped around a Builder of many rows, one resource and a flat list of
 * `path => header` columns, streamed in chunks. A data-subject export is one
 * customer and a nested graph — orders with their lines, payments and refunds,
 * and the audit trail. Forcing it through the CSV path would mean six separate
 * files or one flattened half-truth.
 *
 * What it DOES carry across are the two ideas `CsvExport` exists to protect:
 *
 * 1. **Serialise through the screen's own resources, via `resolve()`** — never
 *    `toArray()`. A resource's `mergeWhen` returns an int-keyed MergeValue
 *    placeholder from `toArray()`, which the response pipeline flattens later;
 *    read directly, the cost fields vanish for every role, including the ones
 *    allowed to see them. `resolve()` runs the same filtering the endpoint
 *    does, so the redaction is inherited rather than reimplemented.
 *
 * 2. **Audit before producing the body.** The auditable fact is that the data
 *    was released, and that is true the moment the request is authorised.
 */
final class CustomerDataExport
{
    public function __construct(
        private readonly AuditRecorder $recorder,
        private readonly CsvExport $csv,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function for(Customer $customer, Request $request): array
    {
        $user = $request->user();

        $orders = $customer->orders()
            ->with(['items', 'payments', 'refunds', 'customer'])
            ->orderByDesc('placed_at')
            ->orderByDesc('created_at')
            ->get();

        // The same cap as every other export, for the same reason, and
        // testable by lowering it in config (config/export.php).
        $max = $this->csv->maxRows();

        if ($orders->count() > $max) {
            throw ValidationException::withMessages([
                'customer' => __('errors.export.too_many_rows', [
                    'rows' => app(Localizer::class)->number($orders->count()),
                    'limit' => app(Localizer::class)->number($max),
                ]),
            ]);
        }

        /*
         * The audit trail is included ONLY for a reader who may read the audit
         * trail.
         *
         * An Analyst holds customers.export but NOT activity.view, so sending
         * it unconditionally would widen access through a side door. A denied
         * section is OMITTED, never sent empty — the same rule the resources
         * use for a denied field.
         */
        $includesActivity = $user?->can(Ability::ActivityView->value) ?? false;

        $activity = $includesActivity
            ? ActivityLog::query()
                ->where('subject_type', 'Customer')
                ->where('subject_id', $customer->getKey())
                ->orderByDesc('created_at')
                ->limit($max)
                ->get()
            : null;

        $this->recorder->record(
            action: 'customer.exported',
            subject: $customer,
            context: [
                'resource' => 'customer-data',
                'order_count' => $orders->count(),
                'includes_activity' => $includesActivity,
            ],
        );

        $payload = [
            'exported_at' => now()->toIso8601String(),
            'business' => [
                'id' => CurrentBusiness::get()->id(),
                'name' => BusinessSetting::current()->company_name,
            ],
            'customer' => CustomerResource::make($customer)->resolve($request),
            'orders' => $orders
                ->map(fn ($order): array => OrderResource::make($order)->resolve($request))
                ->all(),
        ];

        if ($activity !== null) {
            $payload['activity'] = $activity
                ->map(fn ($row): array => ActivityLogResource::make($row)->resolve($request))
                ->all();
        }

        return [
            'data' => $payload,
            'meta' => [
                'order_count' => $orders->count(),
                'activity_count' => $activity?->count(),
                'includes_activity' => $includesActivity,
            ],
        ];
    }

    /** `customer-7-2026-10-25.json` — the id, so two exports never collide. */
    public function filename(Customer $customer): string
    {
        return 'customer-'.$customer->getKey().'-'.now()->toDateString().'.json';
    }
}
