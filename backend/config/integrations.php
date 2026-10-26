<?php

declare(strict_types=1);

use App\Domain\Integrations\Salla\SallaWebhooks;

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
    ],

    'secrets' => [
        'salla' => env('SALLA_WEBHOOK_SECRET'),
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
