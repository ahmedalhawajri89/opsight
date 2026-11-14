<?php

declare(strict_types=1);

use App\Domain\Integrations\Salla\SallaConnector;
use App\Domain\Integrations\Salla\SallaWebhooks;
use App\Domain\Integrations\Shopify\ShopifyConnector;
use App\Domain\Integrations\WooCommerce\WooConnector;
use App\Domain\Integrations\Zid\ZidConnector;
use App\Domain\Integrations\Zid\ZidWebhooks;

/*
 * Providers this installation accepts webhook deliveries from (ADR-027).
 *
 * Empty by default, and that is a security property rather than an oversight:
 * `POST /v1/webhooks/salla` is a 404 until Salla is both implemented and
 * named here, so no endpoint exists that accepts a payload nothing can
 * verify.
 *
 * Secrets live beside the registration, read from the environment. They are
 * deployment secrets, not business data: a business connects its store
 * through OAuth and never sees or sets the signing secret.
 */
return [

    /**
     * Registered, and still inert until a secret is set.
     *
     * `WebhookProviders::secretFor()` returns null without
     * `SALLA_WEBHOOK_SECRET`, and the controller answers 404 to a provider
     * with no secret — so an installation that has not connected Salla has
     * no webhook endpoint at all, exactly as before this line was added.
     *
     * @var array<string, class-string>
     */
    'providers' => [
        'salla' => SallaWebhooks::class,
        // Inert without ZID_WEBHOOK_SECRET, exactly like Salla.
        'zid' => ZidWebhooks::class,
    ],

    /*
     * Stores whose history can be imported, by provider name (ADR-037).
     *
     * Separate from `providers` above because receiving webhooks and reading
     * a store's records are different contracts: a provider could offer one
     * without the other.
     *
     * @var array<string, class-string>
     */
    'connectors' => [
        'salla' => SallaConnector::class,
        'zid' => ZidConnector::class,
        'woocommerce' => WooConnector::class,
        'shopify' => ShopifyConnector::class,
    ],

    /*
     * Salla's own endpoints and app credentials.
     *
     * The hosts are configurable so a test can point them at nothing and a
     * fixture recorder can point them at a sandbox, not because they are
     * expected to change.
     */
    'salla' => [
        'client_id' => env('SALLA_CLIENT_ID'),
        'client_secret' => env('SALLA_CLIENT_SECRET'),
        'token_url' => env('SALLA_TOKEN_URL', 'https://accounts.salla.sa/oauth2/token'),
        'api_base' => env('SALLA_API_BASE', 'https://api.salla.dev/admin/v2'),

        /*
         * How long before expiry a token is treated as due for refresh.
         *
         * Salla's access tokens last a fortnight, so five minutes is not
         * caution about clock drift — it is about a token that passes the
         * check and then expires during the request that used it.
         */
        'refresh_margin_minutes' => 5,
    ],

    /*
     * Zid's app credentials and endpoints (ADR-037), from its Authorization
     * documentation. `redirect_uri` must match the Redirection URL set on the
     * app in Zid's Partner Dashboard exactly, and points at the FRONTEND's
     * callback page — which hands the code to the API inside the owner's
     * session, so the state can be checked against who started the flow.
     *
     * `webhook_url` is where Zid is told to deliver. Defaults to this
     * installation's own route; set it when the API is reached through a
     * public tunnel or a different host than the one it answers on.
     */
    'zid' => [
        'client_id' => env('ZID_CLIENT_ID'),
        'client_secret' => env('ZID_CLIENT_SECRET'),
        'redirect_uri' => env('ZID_REDIRECT_URI'),
        'oauth_base' => env('ZID_OAUTH_BASE', 'https://oauth.zid.sa'),
        'api_base' => env('ZID_API_BASE', 'https://api.zid.sa/v1'),
        'webhook_url' => env('ZID_WEBHOOK_URL'),
    ],

    /*
     * WooCommerce (2026-11-13): no partner app. The owner pastes a read-only
     * REST key made in their own store; Baydar polls for changed orders.
     */
    'woocommerce' => [
        'timeout' => (int) env('WOOCOMMERCE_TIMEOUT', 20),
        // Only for a developer's test store on localhost (PublicUrl).
        'allow_private_hosts' => (bool) env('WOOCOMMERCE_ALLOW_PRIVATE_HOSTS', env('APP_ENV') === 'local'),
    ],

    /*
     * Shopify (2026-11-13): Baydar's own app for the OAuth way in, registered
     * in Shopify's Dev Dashboard. Without it only a pasted token works.
     */
    'shopify' => [
        'client_id' => env('SHOPIFY_CLIENT_ID'),
        'client_secret' => env('SHOPIFY_CLIENT_SECRET'),
        'redirect_uri' => env('SHOPIFY_REDIRECT_URI'),
        'scopes' => env('SHOPIFY_SCOPES', 'read_orders,read_products'),
        // Shopify ships a version each quarter and serves each about a year;
        // 2026-10 is served until October 2027.
        'api_version' => env('SHOPIFY_API_VERSION', '2026-10'),
    ],

    'secrets' => [
        'salla' => env('SALLA_WEBHOOK_SECRET'),

        /*
         * Zid signs nothing; this is the Basic Auth password Baydar gives Zid
         * when it registers a store's webhooks, and checks on every delivery
         * (ZidWebhooks). Installation-wide, so rotating it means
         * reconnecting every Zid store.
         */
        'zid' => env('ZID_WEBHOOK_SECRET'),
    ],

    /*
     * The largest delivery body accepted, in kilobytes.
     *
     * A webhook endpoint is unauthenticated by nature — the signature is the
     * authentication, and it cannot be checked until the body has been read.
     * So the body is what an attacker controls for free, and it needs a
     * ceiling that is not "whatever PHP allows". An order with two hundred
     * lines is a few tens of kilobytes.
     */
    'max_payload_kb' => (int) env('WEBHOOK_MAX_PAYLOAD_KB', 512),

];
