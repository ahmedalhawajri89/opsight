<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Shopify;

/**
 * A shop's permanent `name.myshopify.com` domain, from whatever the owner
 * typed: "mystore", "mystore.myshopify.com" or the admin's address.
 *
 * Only that shape is accepted, never a custom domain: the API answers on the
 * myshopify domain, and a fixed suffix means the server cannot be pointed at
 * any host but Shopify's.
 */
final class ShopifyDomain
{
    public static function normalise(string $input): ?string
    {
        $value = strtolower(trim($input));
        $value = (string) preg_replace('#^https?://#', '', $value);
        $value = explode('/', $value)[0];

        if ($value !== '' && ! str_contains($value, '.')) {
            $value .= '.myshopify.com';
        }

        return preg_match('/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/', $value) === 1 ? $value : null;
    }
}
