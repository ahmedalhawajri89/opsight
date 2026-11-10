<?php

declare(strict_types=1);

/*
 * Ask Baydar (ADR-038).
 *
 * Inert without ANTHROPIC_API_KEY: the endpoint answers 503 and the screen
 * says the assistant is not set up, exactly as Zid behaves without its app.
 */
return [

    'api_key' => env('ANTHROPIC_API_KEY'),

    /*
     * The model. Claude Opus 5.5 by default. A cheaper model is a decision
     * about quality as much as cost, so it is made here, deliberately, rather
     * than quietly in code.
     */
    'model' => env('ASSISTANT_MODEL', 'claude-opus-5-5'),

    /*
     * Effort: how hard the model thinks. Questions about a business's
     * figures are short reads over a few tool calls, which `medium` (this
     * model's own default, stated rather than assumed) handles. Raise it only
     * when answers measurably need it.
     */
    'effort' => env('ASSISTANT_EFFORT', 'medium'),

    /*
     * A ceiling per business per calendar month, in tokens (input plus
     * output). Past it the assistant says so instead of answering. Pricing
     * tiers will set this per plan; until they exist it is one number.
     */
    'monthly_token_limit' => (int) env('ASSISTANT_MONTHLY_TOKENS', 2_000_000),

    /*
     * How many rounds of tool calls one question may take. A figure needs one
     * or two; a comparison across products three or four. More than this is
     * a loop, and it is stopped rather than paid for.
     */
    'max_tool_rounds' => 6,
];
