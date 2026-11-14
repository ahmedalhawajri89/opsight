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
        'demo_account_protected' => 'The demo accounts stay as they are, so the next visitor can sign in too. Everything else is yours to try, and the data resets every night.',
    ],

    /*
     * One sentence for three different refusals — no such pending store, it
     * expired, someone else has it — on purpose. Telling an owner which
     * store ids exist, or which are already taken, turns the claim into a
     * way to enumerate other people's shops.
     */
    'integrations' => [
        'woocommerce_taken' => 'This WooCommerce store is already connected to another business.',
        'woo_refused' => 'The store refused this key. Make sure it has Read access and was copied in full.',
        'woo_not_store' => 'This address did not answer as a WooCommerce store (HTTP :status). Check the address and that the REST API is on.',
        'woo_unreachable' => 'Baydar cannot reach this address. Use the store\'s public address.',
        'woo_plain_http' => 'Your store runs without HTTPS, so the key cannot be sent to it safely. Turn on an SSL certificate with your host, then try again.',
        'woo_blocked' => 'Baydar reached your site, but a firewall or security plugin stopped the request. Allow the WooCommerce REST API (the wp-json path) in your security or hosting settings.',
        'woo_no_woocommerce' => 'This is a WordPress site, but WooCommerce is not active on it. Make sure the WooCommerce plugin is on and that this is the store address.',
        'woo_bad_url' => 'Enter the store\'s address, starting with https://',
        'shopify_taken' => 'This Shopify store is already connected to another business.',
        'shopify_refused' => 'Shopify refused this token. Make sure it is the Admin API access token and the app can read orders and products.',
        'shopify_unreachable' => 'Baydar cannot reach this store. Check its name.',
        'shopify_bad_shop' => 'Enter the store name as Shopify shows it, for example mystore.myshopify.com.',
        'shopify_unavailable' => 'Connecting through Baydar\'s Shopify app is not set up on this system yet.',
        'shopify_signature' => 'This answer did not come from Shopify. Start the connection again.',
        'shopify_state' => 'This link has expired or belongs to another session. Start the connection again.',
        'claim_not_found' => 'No store is waiting to be connected with that id. Install the app from your store again, then enter the id within the hour.',
        'zid_unavailable' => 'Connecting a Zid store is not set up on this installation yet.',
        'zid_state' => 'This connection request has expired or was not started from this account. Start again from Connected stores.',
        'zid_refused' => 'Zid did not accept the connection. Start again from Connected stores; if it keeps happening, reinstall the app from Zid.',
        'zid_taken' => 'That Zid store is already connected to another business. Disconnect it there first.',
    ],

    'filter' => [
        'malformed' => 'Filters must be supplied as filter[key]=value.',
        'unknown' => 'Unknown filter: :unknown. Allowed: :allowed.',
        'unsortable' => "Cannot sort by ':field'. Allowed: :allowed.",
        'date' => "':value' is not a date. Use the form 2026-11-30.",
    ],

    'customer' => [
        'already_erased' => 'This customer was already erased. Their personal details are gone and cannot be erased again.',
    ],

    'export' => [
        'too_many_rows' => 'This export would contain :rows rows, above the limit of :limit. Narrow the filters and try again.',
    ],

    'inventory' => [
        'insufficient_stock' => ':product has :available in stock but :requested were requested.',
        'negative_stock' => 'This adjustment would leave :product at :resulting. Stock cannot be negative.',
        'reason_required' => 'A manual stock adjustment requires a reason.',
    ],

    'analytics' => [
        'period_too_long' => 'A custom range cannot be longer than :days days.',
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
        'discount_exceeds_subtotal' => 'The discount is more than the goods on this order are worth.',
        'line_discount_exceeds_line' => 'The discount on :product is larger than the line itself. A line can be discounted to nothing, not below.',
        'refund_not_positive' => 'That refund comes to nothing in this currency. Enter an amount of at least the smallest unit.',
        'refund_exceeds_total' => 'A refund cannot exceed what is left to refund on this order.',
        'stock_already_returned' => 'The stock for this order has already been returned. Record this refund without returning stock.',
        'not_refundable' => 'Only a fulfilled order can be refunded.',
    ],

    'users' => [
        'last_owner_demote' => 'This is the last active Owner. Promote another user to Owner before changing this role.',
        'last_owner_deactivate' => 'This is the last active Owner. Promote another user to Owner before deactivating this account.',
    ],

];
