<?php

declare(strict_types=1);

use Anthropic\Client;
use App\Domain\Assistant\ClaudeModel;
use GuzzleHttp\Psr7\Response;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

/*
|--------------------------------------------------------------------------
| The one class that talks to Anthropic (ADR-038)
|--------------------------------------------------------------------------
|
| The real SDK, with its HTTP transport replaced, so what is checked is the
| request as it would leave the server and a response in the API's own wire
| shape. No network, no key, no cost.
|
*/

/** A PSR-18 client that answers once and keeps what it was sent. */
final class RecordingTransport implements ClientInterface
{
    public ?RequestInterface $request = null;

    /** @param array<string, mixed> $body */
    public function __construct(private readonly array $body) {}

    public function sendRequest(RequestInterface $request): ResponseInterface
    {
        $this->request = $request;

        return new Response(200, ['Content-Type' => 'application/json'], (string) json_encode($this->body));
    }
}

function claudeWith(RecordingTransport $transport): ClaudeModel
{
    return new ClaudeModel(new Client(apiKey: 'test-key', requestOptions: ['transporter' => $transport]));
}

const WIRE_REPLY = [
    'id' => 'msg_1', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-opus-5-5',
    'stop_reason' => 'tool_use', 'stop_sequence' => null,
    'content' => [
        ['type' => 'thinking', 'thinking' => '', 'signature' => 'sig-abc'],
        ['type' => 'text', 'text' => 'Let me look.'],
        ['type' => 'tool_use', 'id' => 'toolu_9', 'name' => 'get_summary', 'input' => ['from' => '2026-03-01', 'to' => '2026-03-31']],
    ],
    'usage' => [
        'input_tokens' => 120, 'output_tokens' => 40,
        'cache_read_input_tokens' => 3000, 'cache_creation_input_tokens' => 0,
    ],
];

it('sends the model, effort, fallbacks and both cache breakpoints', function (): void {
    config(['assistant.model' => 'claude-opus-5-5', 'assistant.effort' => 'medium']);
    $transport = new RecordingTransport(WIRE_REPLY);

    claudeWith($transport)->respond('You are Baydar\'s assistant.', [[
        'name' => 'get_summary', 'description' => 'Figures.',
        'inputSchema' => ['type' => 'object', 'properties' => ['from' => ['type' => 'string']], 'required' => ['from'], 'additionalProperties' => false],
        'strict' => true,
    ]], [['role' => 'user', 'content' => [['type' => 'text', 'text' => 'Hi']]]]);

    $body = json_decode((string) $transport->request?->getBody(), true);

    expect($body['model'])->toBe('claude-opus-5-5')
        ->and($body['output_config'])->toBe(['effort' => 'medium'])
        // A benign question declined by a safety classifier is retried on a
        // model the server picks, rather than leaving the owner with nothing.
        ->and($body['fallbacks'])->toBe('default')
        ->and($transport->request?->getHeaderLine('anthropic-beta'))->toContain('server-side-fallback-2026-07-01')
        // The system block caches the tools rendered before it; the top-level
        // breakpoint caches the conversation as it grows.
        ->and($body['system'][0]['cache_control'])->toBe(['type' => 'ephemeral'])
        ->and($body['cache_control'])->toBe(['type' => 'ephemeral'])
        // camelCase in our code, snake_case on the wire.
        ->and($body['tools'][0])->toHaveKey('input_schema')
        ->and($body['tools'][0]['strict'])->toBeTrue()
        // Thinking cannot be switched off on this model; sending it is a 400.
        ->and($body)->not->toHaveKey('thinking');
});

it('maps a tool_result written in camelCase to the API\'s own keys', function (): void {
    $transport = new RecordingTransport(WIRE_REPLY);

    claudeWith($transport)->respond('s', [], [
        ['role' => 'user', 'content' => [['type' => 'text', 'text' => 'Hi']]],
        ['role' => 'assistant', 'content' => [['type' => 'tool_use', 'id' => 'toolu_9', 'name' => 'get_summary', 'input' => ['from' => '2026-03-01']]]],
        ['role' => 'user', 'content' => [['type' => 'tool_result', 'toolUseID' => 'toolu_9', 'content' => '{}', 'isError' => false]]],
    ]);

    $result = json_decode((string) $transport->request?->getBody(), true)['messages'][2]['content'][0];

    expect($result)->toMatchArray(['type' => 'tool_result', 'tool_use_id' => 'toolu_9', 'is_error' => false]);
});

it('reads the reply into plain blocks, keeping the thinking signature to send back', function (): void {
    $reply = claudeWith(new RecordingTransport(WIRE_REPLY))->respond('s', [], [['role' => 'user', 'content' => 'Hi']]);

    expect($reply->stopReason)->toBe('tool_use')
        ->and($reply->content[0])->toBe(['type' => 'thinking', 'thinking' => '', 'signature' => 'sig-abc'])
        ->and($reply->toolCalls())->toBe([['type' => 'tool_use', 'id' => 'toolu_9', 'name' => 'get_summary', 'input' => ['from' => '2026-03-01', 'to' => '2026-03-31']]])
        ->and($reply->text())->toBe('Let me look.')
        ->and($reply->inputTokens)->toBe(120)
        ->and($reply->cacheReadTokens)->toBe(3000);
});
