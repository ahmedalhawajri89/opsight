<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use Anthropic\Core\Exceptions\APIException;
use Anthropic\Core\Exceptions\OverloadedException;
use Anthropic\Core\Exceptions\RateLimitException;
use App\Authorization\Ability;
use App\Domain\Assistant\AskBaydar;
use App\Domain\Assistant\AssistantLimitReached;
use App\Http\Controllers\Controller;
use App\Models\AssistantConversation;
use App\Models\AssistantMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Ask Baydar (ADR-038).
 *
 * Open to whoever may read the analytics, because it reads the same figures
 * through the same services. A conversation is its author's alone: another
 * user's id answers 404, the same as one that does not exist.
 */
class AssistantController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAssistant($request);

        $conversations = AssistantConversation::query()
            ->where('user_id', $request->user()?->getKey())
            ->latest('updated_at')
            ->limit(30)
            ->get(['id', 'title', 'updated_at']);

        return response()->json([
            'data' => $conversations->map(static fn (AssistantConversation $c): array => [
                'id' => $c->id,
                'title' => $c->title,
                'updated_at' => $c->updated_at?->toIso8601String(),
            ]),
            'meta' => ['available' => $this->configured()],
        ]);
    }

    public function show(Request $request, int $conversation): JsonResponse
    {
        $this->authorizeAssistant($request);

        $found = $this->own($request, $conversation);

        return response()->json(['data' => [
            'id' => $found->id,
            'title' => $found->title,
            // Only the turns a person reads: the question and the answer.
            // Tool calls and their raw results stay on the server.
            'messages' => $found->messages()->whereNotNull('display')->get()
                ->map(fn (AssistantMessage $m): array => $this->message($m)),
        ]]);
    }

    public function store(Request $request, AskBaydar $ask): JsonResponse
    {
        $this->authorizeAssistant($request);

        if (! $this->configured()) {
            return response()->json([
                'message' => __('assistant.unavailable'),
                'code' => 'assistant.unavailable',
            ], 503);
        }

        $input = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            'conversation_id' => ['nullable', 'integer'],
        ]);

        $conversation = isset($input['conversation_id']) ? $this->own($request, (int) $input['conversation_id']) : null;

        // A few tool rounds, each a model call: give it longer than a page.
        set_time_limit(120);

        try {
            $result = $ask->ask($request->user(), $input['message'], $conversation);
        } catch (AssistantLimitReached) {
            return response()->json([
                'message' => __('assistant.limit'),
                'code' => 'assistant.limit',
            ], 429);
        } catch (RateLimitException|OverloadedException) {
            // Temporary, and the SDK has already retried. Said as such, so the
            // owner asks again in a minute rather than concluding it is broken.
            return response()->json([
                'message' => __('assistant.busy'),
                'code' => 'assistant.busy',
            ], 503);
        } catch (APIException $e) {
            report($e);

            return response()->json([
                'message' => __('assistant.upstream'),
                'code' => 'assistant.upstream',
            ], 502);
        }

        return response()->json(['data' => [
            'conversation_id' => $result['conversation']->id,
            'answer' => $this->message($result['answer']),
        ]], 201);
    }

    /** @return array<string, mixed> */
    private function message(AssistantMessage $message): array
    {
        return [
            'id' => $message->id,
            'role' => $message->role,
            'text' => $message->display,
            'sources' => $message->sources ?? [],
            'created_at' => $message->created_at?->toIso8601String(),
        ];
    }

    private function own(Request $request, int $id): AssistantConversation
    {
        return AssistantConversation::query()
            ->where('user_id', $request->user()?->getKey())
            ->findOrFail($id);
    }

    private function authorizeAssistant(Request $request): void
    {
        if (! ($request->user()?->can(Ability::AnalyticsView->value) ?? false)) {
            abort(403);
        }
    }

    private function configured(): bool
    {
        return filled(config('assistant.api_key'));
    }
}
