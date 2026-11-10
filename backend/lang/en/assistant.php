<?php

declare(strict_types=1);

/*
 * Ask Baydar (ADR-038). Each message says what happened and what the owner
 * can do, never just that something failed.
 */
return [
    'unavailable' => 'Ask Baydar is not set up on this installation yet.',
    'limit' => 'This business has used this month\'s questions. The allowance renews on the first of the month.',
    'busy' => 'Ask Baydar is busy right now. Try again in a minute.',
    'upstream' => 'Ask Baydar could not answer just now. Try again shortly; your figures are unaffected.',
    'refused' => 'I can\'t help with that one. Try asking about your sales, profit, customers, products or stock.',
    'too_many_steps' => 'That needed more steps than one question allows. Try asking about one period or one product at a time.',
    'too_long' => 'The answer ran too long to finish. Try a narrower question.',
    'no_answer' => 'I couldn\'t find an answer in your records.',
];
