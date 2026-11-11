<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Brief\SendBrief;
use App\Http\Controllers\Controller;
use App\Models\BriefDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * The morning brief, from the reader's side: what it would say today, the
 * last few deliveries, and a test send (phase C).
 */
class BriefController extends Controller
{
    public function show(Request $request, SendBrief $send): JsonResponse
    {
        $user = $request->user();
        $this->authorizeBrief($request);

        $preview = $send->preview($user);

        return response()->json(['data' => [
            'enabled' => (bool) $user->morning_brief,
            'channel' => $user->brief_channel,
            'whatsapp_phone' => $user->whatsapp_phone,
            'whatsapp_available' => $send->whatsappAvailable(),
            'hour' => (int) config('brief.hour', 8),
            'preview' => $preview['text'] + [
                'quiet' => $preview['brief']['quiet'],
                /*
                 * The same figures the text was written from, raw, so the
                 * screen can lay them out as figures. Already shaped by the
                 * reader's role: what they may not see arrives as null.
                 */
                'figures' => [
                    'revenue' => $preview['brief']['revenue'],
                    'change' => $preview['brief']['change'],
                    'orders' => $preview['brief']['orders'],
                    'gross_profit' => $preview['brief']['gross_profit'],
                    'month_to_date' => $preview['brief']['month_to_date'],
                    'receivables' => $preview['brief']['receivables'],
                    'stock' => $preview['brief']['stock'],
                    'actions' => $preview['brief']['actions'],
                ],
            ],
            'recent' => BriefDelivery::query()
                ->where('user_id', $user->id)
                ->latest('brief_date')
                ->limit(7)
                ->get(['brief_date', 'channel', 'status', 'error'])
                ->map(static fn (BriefDelivery $d): array => [
                    'date' => (string) $d->brief_date,
                    'channel' => $d->channel,
                    'status' => $d->status,
                    'error' => $d->error,
                ]),
        ]]);
    }

    public function test(Request $request, SendBrief $send): JsonResponse
    {
        $this->authorizeBrief($request);

        try {
            $send->test($request->user());
        } catch (Throwable $e) {
            report($e);

            return response()->json(['message' => SendBrief::readerMessage($e), 'code' => 'brief.failed'], 422);
        }

        return response()->json(['message' => __('brief.sent_test')], 202);
    }

    private function authorizeBrief(Request $request): void
    {
        if (! ($request->user()?->can(Ability::DashboardView->value) ?? false)) {
            abort(403);
        }
    }
}
