<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Authorization\Ability;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ActivityLog
 */
class ActivityLogResource extends JsonResource
{
    /**
     * Attribute names that carry cost, and must not reach a cost-blind reader
     * through a diff.
     *
     * THIS IS THE POINT OF THIS CLASS. Every other surface in the system
     * redacts cost by omitting it from a resource, and the audit log would
     * quietly undo all of it: `product.updated` with
     * `{"before":{"cost":"4.20"},"after":{"cost":"4.80"}}` is the cost figure,
     * in plain text, on a screen reached by a different ability. Redaction
     * has to follow the data, not the endpoint.
     *
     * @var list<string>
     */
    private const COST_KEYS = ['cost', 'unit_cost', 'cogs_amount', 'margin_amount'];

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $user = $request->user();

        return [
            'id' => $this->id,
            'action' => $this->action,

            // `order`, `product` — the noun the action happened to. Enough to
            // group and filter by without exposing a class path.
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,

            'changes' => $this->scrub($this->changes, $user),
            'context' => $this->scrub($this->context, $user),

            // Unpacked from VARBINARY on the way out. The column holds IPv4
            // and IPv6 in one fixed width; the API speaks the readable form.
            'ip_address' => $this->readableIp(),
            'user_agent' => $this->user_agent,

            'occurred_at' => $this->created_at->toIso8601String(),

            'actor' => $this->whenLoaded('user', fn (): ?array => $this->user === null ? null : [
                'id' => $this->user->id,
                'name' => $this->user->name,
                'role_label' => $this->user->role->label(),
            ]),
        ];
    }

    /**
     * @param  array<array-key, mixed>|null  $payload
     * @return array<array-key, mixed>|null
     */
    private function scrub(?array $payload, ?User $user): ?array
    {
        if ($payload === null) {
            return null;
        }

        // Fail closed: no user resolved means no cost, not "assume allowed".
        if ($user !== null && $user->can(Ability::ProductsViewCost->value)) {
            return $payload;
        }

        return $this->withoutCostKeys($payload);
    }

    /**
     * @param  array<array-key, mixed>  $payload
     * @return array<array-key, mixed>
     */
    private function withoutCostKeys(array $payload): array
    {
        $clean = [];

        foreach ($payload as $key => $value) {
            if (is_string($key) && in_array(mb_strtolower($key), self::COST_KEYS, strict: true)) {
                continue;
            }

            $clean[$key] = is_array($value) ? $this->withoutCostKeys($value) : $value;
        }

        return $clean;
    }

    private function readableIp(): ?string
    {
        if (! is_string($this->ip_address) || $this->ip_address === '') {
            return null;
        }

        $readable = @inet_ntop($this->ip_address);

        return $readable === false ? null : $readable;
    }
}
