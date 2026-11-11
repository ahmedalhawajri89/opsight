<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Assistant\AssistantTools;
use App\Domain\Assistant\LanguageModel;
use App\Domain\Assistant\ModelReply;
use App\Models\AssistantConversation;
use App\Models\AssistantMessage;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;
use Tests\Support\MetricFixture;

/*
|--------------------------------------------------------------------------
| Ask Baydar (ADR-038)
|--------------------------------------------------------------------------
|
| The model is scripted: each test says what it would reply, and the tests
| check everything around it — which tools a role is offered, that every
| figure comes from a tool this server ran, that the loop stops, and that
| one person's conversation is theirs alone. No test calls Anthropic.
|
*/

/** A model that replies from a script and remembers what it was sent. */
final class ScriptedModel implements LanguageModel
{
    /** @var list<array{system: string, tools: list<array<string, mixed>>, messages: list<array<string, mixed>>}> */
    public array $calls = [];

    /** @param list<ModelReply> $replies */
    public function __construct(private array $replies) {}

    public function respond(string $system, array $tools, array $messages): ModelReply
    {
        $this->calls[] = compact('system', 'tools', 'messages');

        return array_shift($this->replies) ?? new ModelReply('end_turn', [['type' => 'text', 'text' => 'Done.']]);
    }
}

function script(ModelReply ...$replies): ScriptedModel
{
    $model = new ScriptedModel($replies);
    app()->instance(LanguageModel::class, $model);

    return $model;
}

function callsTool(string $name, array $input, string $id = 'toolu_1'): ModelReply
{
    return new ModelReply('tool_use', [['type' => 'tool_use', 'id' => $id, 'name' => $name, 'input' => $input]], inputTokens: 1000, outputTokens: 50);
}

function says(string $text): ModelReply
{
    return new ModelReply('end_turn', [['type' => 'text', 'text' => $text]], inputTokens: 1200, outputTokens: 80);
}

beforeEach(function (): void {
    RateLimiter::clear('assistant');
    config(['assistant.api_key' => 'test-key']);
    $this->owner = User::factory()->role(Role::Owner)->create();
});

function ask(string $message, ?int $conversation = null, ?User $as = null): TestResponse
{
    return test()->actingAs($as ?? test()->owner)->postJson('/api/v1/assistant/messages', array_filter([
        'message' => $message,
        'conversation_id' => $conversation,
    ]));
}

/*
|--------------------------------------------------------------------------
| Figures come from tools
|--------------------------------------------------------------------------
*/

it('answers from a tool it ran, and names the figures\' source', function (): void {
    MetricFixture::build();

    $model = script(
        callsTool('get_summary', ['from' => MetricFixture::FROM, 'to' => MetricFixture::TO]),
        says('Net revenue was 1,234.000.'),
    );

    ask('How did we do?')
        ->assertCreated()
        ->assertJsonPath('data.answer.text', 'Net revenue was 1,234.000.')
        ->assertJsonPath('data.answer.sources.0.tool', 'get_summary')
        ->assertJsonPath('data.answer.sources.0.from', MetricFixture::FROM);

    // The second call carried the tool's real result, computed by the same
    // service the analytics screen uses.
    $results = collect($model->calls[1]['messages'])->last()['content'];

    expect($results[0]['type'])->toBe('tool_result')
        ->and($results[0]['toolUseID'])->toBe('toolu_1')
        ->and($results[0]['isError'])->toBeFalse()
        ->and($results[0]['content'])->toContain('net_revenue');
});

it('hands a mistaken call back to the model to correct, rather than failing', function (): void {
    $model = script(
        callsTool('get_summary', ['from' => '2026-02-31', 'to' => '2026-03-05']),
        callsTool('get_summary', ['from' => '2026-03-01', 'to' => '2026-03-05'], 'toolu_2'),
        says('Here it is.'),
    );

    ask('March so far?')->assertCreated();

    $first = collect($model->calls[1]['messages'])->last()['content'][0];

    expect($first['isError'])->toBeTrue()
        ->and($first['content'])->toContain('real dates');
});

it('sends every result of a round together, in one turn', function (): void {
    $model = script(
        new ModelReply('tool_use', [
            ['type' => 'tool_use', 'id' => 'a', 'name' => 'get_summary', 'input' => ['from' => '2026-03-01', 'to' => '2026-03-05']],
            ['type' => 'tool_use', 'id' => 'b', 'name' => 'get_insights', 'input' => ['from' => '2026-03-01', 'to' => '2026-03-05']],
        ]),
        says('Both read.'),
    );

    ask('Anything I should know?')->assertCreated();

    expect(collect($model->calls[1]['messages'])->last()['content'])->toHaveCount(2);
});

/*
|--------------------------------------------------------------------------
| What a role is offered
|--------------------------------------------------------------------------
*/

it('offers no cost metric to someone who may not see cost', function (): void {
    /*
     * Enforced by what exists, not by what is asked: the options are absent
     * from the definitions, so no phrasing can request them. Staff stand in
     * for any role without metrics.view_cost.
     */
    $tools = app(AssistantTools::class);
    $blind = collect($tools->definitionsFor(User::factory()->role(Role::Staff)->create()))->keyBy('name');
    $sighted = collect($tools->definitionsFor($this->owner))->keyBy('name');

    expect($blind['get_trend']['inputSchema']['properties']['metric']['enum'])->not->toContain('cogs')->not->toContain('gross_profit')
        ->and($blind['get_breakdown']['inputSchema']['properties']['metric']['enum'])->toBe(['net_revenue', 'units_sold'])
        ->and($blind['get_summary']['description'])->not->toContain('profit')
        ->and($sighted['get_trend']['inputSchema']['properties']['metric']['enum'])->toContain('gross_profit');
});

it('refuses a cost metric even if one is asked for by name', function (): void {
    $outcome = app(AssistantTools::class)->run(User::factory()->role(Role::Staff)->create(), 'get_breakdown', [
        'from' => '2026-03-01', 'to' => '2026-03-05', 'dimension' => 'product', 'metric' => 'gross_profit',
    ]);

    expect($outcome['error'])->toBeTrue()
        ->and(json_encode($outcome['result']))->not->toContain('gross_profit":');
});

it('keeps the assistant from anyone who may not read the analytics', function (): void {
    script(says('x'));

    ask('Profit?', as: User::factory()->role(Role::Staff)->create())->assertForbidden();
});

it('gives every member of a role the same instructions and tools, whatever the day', function (): void {
    /*
     * The system prompt and tool list are the cached prefix. Anything in them
     * that varied — a date, a name — would make every request pay full price.
     */
    $model = script(says('one'), says('two'));

    Carbon::setTestNow('2026-03-05 10:00:00');
    ask('First?');
    Carbon::setTestNow('2026-03-06 10:00:00');
    ask('Second?', as: User::factory()->role(Role::Owner)->create());
    Carbon::setTestNow();

    expect($model->calls[0]['system'])->toBe($model->calls[1]['system'])
        ->and($model->calls[0]['tools'])->toBe($model->calls[1]['tools'])
        // Today travels with the question instead.
        ->and($model->calls[0]['messages'][0]['content'][0]['text'])->toContain('2026-03-05')
        ->and($model->calls[1]['messages'][0]['content'][0]['text'])->toContain('2026-03-06');
});

/*
|--------------------------------------------------------------------------
| It stops
|--------------------------------------------------------------------------
*/

it('stops a question that keeps calling tools, and says so', function (): void {
    config(['assistant.max_tool_rounds' => 2]);
    $model = script(
        callsTool('get_insights', ['from' => '2026-03-01', 'to' => '2026-03-05'], 'a'),
        callsTool('get_insights', ['from' => '2026-03-01', 'to' => '2026-03-05'], 'b'),
        callsTool('get_insights', ['from' => '2026-03-01', 'to' => '2026-03-05'], 'c'),
    );

    ask('Loop forever')->assertCreated()->assertJsonPath('data.answer.text', __('assistant.too_many_steps'));

    expect($model->calls)->toHaveCount(2);
});

it('stops answering once the business has used its month, without calling the model', function (): void {
    config(['assistant.monthly_token_limit' => 1000]);
    $model = script(says('first'), says('second'));

    ask('One?')->assertCreated();  // 1,280 tokens: over the line now.
    ask('Two?')->assertStatus(429)->assertJsonPath('code', 'assistant.limit');

    expect($model->calls)->toHaveCount(1);
});

it('records what each answer cost, so the month can be counted', function (): void {
    script(callsTool('get_insights', ['from' => '2026-03-01', 'to' => '2026-03-05']), says('ok'));

    ask('Insights?');

    $answer = AssistantMessage::query()->whereNotNull('display')->where('role', 'assistant')->sole();

    expect($answer->input_tokens)->toBe(2200)
        ->and($answer->output_tokens)->toBe(130);
});

it('shows a refusal as a plain sentence, not a half answer', function (): void {
    script(new ModelReply('refusal', [['type' => 'text', 'text' => 'partial']]));

    ask('Something odd')->assertCreated()->assertJsonPath('data.answer.text', __('assistant.refused'));
});

it('says plainly when the assistant is not set up', function (): void {
    config(['assistant.api_key' => null]);

    ask('Hello?')->assertStatus(503)->assertJsonPath('code', 'assistant.unavailable');
});

/*
|--------------------------------------------------------------------------
| Conversations
|--------------------------------------------------------------------------
*/

it('continues a conversation with everything said so far', function (): void {
    $model = script(says('Revenue was up.'), says('Because of the lamp.'));

    $id = ask('How was March?')->json('data.conversation_id');
    ask('Why?', $id)->assertCreated();

    $sent = $model->calls[1]['messages'];

    expect($sent)->toHaveCount(3)
        ->and($sent[1]['content'][0]['text'])->toBe('Revenue was up.')
        ->and($sent[2]['content'][1]['text'])->toBe('Why?');
});

it('shows a conversation as questions and answers, keeping the tool traffic on the server', function (): void {
    script(callsTool('get_insights', ['from' => '2026-03-01', 'to' => '2026-03-05']), says('All quiet.'));

    $id = ask('Anything?')->json('data.conversation_id');

    $this->actingAs($this->owner)->getJson("/api/v1/assistant/conversations/{$id}")
        ->assertOk()
        ->assertJsonCount(2, 'data.messages')
        ->assertJsonPath('data.messages.0.text', 'Anything?')
        ->assertJsonPath('data.messages.1.text', 'All quiet.');
});

it('keeps one person\'s conversation from another, even with the same role', function (): void {
    script(says('Private.'));
    $id = ask('Mine')->json('data.conversation_id');
    $colleague = User::factory()->role(Role::Owner)->create();

    $this->actingAs($colleague)->getJson("/api/v1/assistant/conversations/{$id}")->assertNotFound();
    ask('Continue it', $id, $colleague)->assertNotFound();

    expect(AssistantConversation::query()->count())->toBe(1);
});

it('names the products that are low, not only how many there are', function (): void {
    /*
     * The first live test answered "two are out of stock, but the tool did
     * not say which". Low means what the inventory screen's list means
     * (StockLevel::whereLow), so the two can never disagree.
     */
    Product::factory()->withStock(1)->create(['name' => 'Whiteboard', 'sku' => 'WB-1']);
    Product::factory()->withStock(500)->create(['name' => 'Plenty', 'sku' => 'PL-1']);

    $outcome = app(AssistantTools::class)->run($this->owner, 'get_stock_risks', ['within_days' => 14]);

    expect($outcome['error'])->toBeFalse()
        ->and(collect($outcome['result']['low_or_out'])->pluck('sku')->all())->toContain('WB-1')->not->toContain('PL-1');
});

it('lets someone delete their own conversation, and no one else\'s', function (): void {
    script(says('One.'));
    $id = ask('Mine')->json('data.conversation_id');
    $colleague = User::factory()->role(Role::Owner)->create();

    $this->actingAs($colleague)->deleteJson("/api/v1/assistant/conversations/{$id}")->assertNotFound();
    $this->actingAs($this->owner)->deleteJson("/api/v1/assistant/conversations/{$id}")->assertNoContent();

    expect(AssistantConversation::query()->count())->toBe(0)
        ->and(AssistantMessage::query()->count())->toBe(0);
});

it('keeps counting what was spent after the conversation is deleted', function (): void {
    /*
     * The cap used to be the sum of the messages still stored, and deleting
     * a conversation deletes its messages: ask, delete, ask again, without
     * end. The spend is a ledger now, and deleting touches only the record.
     */
    config(['assistant.monthly_token_limit' => 1000]);
    $model = script(says('first'), says('second'));

    $id = ask('One?')->assertCreated()->json('data.conversation_id');
    $this->deleteJson("/api/v1/assistant/conversations/{$id}")->assertSuccessful();

    ask('Two?')->assertStatus(429)->assertJsonPath('code', 'assistant.limit');

    expect($model->calls)->toHaveCount(1);
});

it('stops between rounds of one question once the month is spent', function (): void {
    // Each tool round costs 1,050 tokens: the first is under a 1,500 line,
    // the second crosses it, and no third call is made.
    config(['assistant.monthly_token_limit' => 1500, 'assistant.max_tool_rounds' => 6]);
    $model = script(
        callsTool('get_insights', ['from' => '2026-03-01', 'to' => '2026-03-05'], 'a'),
        callsTool('get_insights', ['from' => '2026-03-01', 'to' => '2026-03-05'], 'b'),
        callsTool('get_insights', ['from' => '2026-03-01', 'to' => '2026-03-05'], 'c'),
        says('never reached'),
    );

    ask('Keep going')->assertCreated()->assertJsonPath('data.answer.text', __('assistant.limit'));

    expect($model->calls)->toHaveCount(2);
});
