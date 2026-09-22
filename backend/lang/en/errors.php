<?php

declare(strict_types=1);

/*
 * Messages for refusals and failures.
 *
 * The API's `code` is the contract a client branches on; these are the
 * human-readable sentences beside it, in the reader's language. A client never
 * parses them.
 */
return [

    'http' => [
        'unauthenticated' => 'Authentication required.',
        'forbidden' => 'This action is not available for your role.',
        'not_found' => 'Resource not found.',
        'rate_limited' => 'Too many requests. Please slow down.',
        'csrf' => 'Your session token expired. Please retry.',
        'server' => 'An unexpected error occurred.',
        'account_deactivated' => 'Your account has been deactivated.',
        'metric_not_permitted' => 'This metric is not available for your role.',
    ],

    'filter' => [
        'malformed' => 'Filters must be supplied as filter[key]=value.',
        'unknown' => 'Unknown filter: :unknown. Allowed: :allowed.',
        'unsortable' => "Cannot sort by ':field'. Allowed: :allowed.",
    ],

    'export' => [
        'too_many_rows' => 'This export would contain :rows rows, above the limit of :limit. Narrow the filters and try again.',
    ],

    'inventory' => [
        'insufficient_stock' => ':product has :available in stock but :requested were requested.',
        'negative_stock' => 'This adjustment would leave :product at :resulting. Stock cannot be negative.',
        'reason_required' => 'A manual stock adjustment requires a reason.',
    ],

    'payments' => [
        'not_payable' => 'Only a confirmed, fulfilled or refunded order can receive a payment.',
        'not_positive' => 'A payment must be more than zero.',
        'exceeds_outstanding' => 'This payment is more than is outstanding on the order.',
    ],

    'order' => [
        'illegal_transition' => 'An order cannot move from :from to :to.',
        'empty' => 'An order cannot be confirmed without at least one item.',
        'not_editable' => 'A :status order cannot be edited. Cancel it and enter a correction instead.',
        'reason_required' => 'A cancellation reason is required.',
        'refund_exceeds_total' => 'A refund cannot exceed what is left to refund on this order.',
        'stock_already_returned' => 'The stock for this order has already been returned. Record this refund without returning stock.',
        'not_refundable' => 'Only a fulfilled order can be refunded.',
    ],

    'users' => [
        'last_owner_demote' => 'This is the last active Owner. Promote another user to Owner before changing this role.',
        'last_owner_deactivate' => 'This is the last active Owner. Promote another user to Owner before deactivating this account.',
    ],

];
