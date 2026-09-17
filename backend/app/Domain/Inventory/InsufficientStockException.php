<?php

declare(strict_types=1);

namespace App\Domain\Inventory;

use App\Support\DomainException;
use App\Support\Localization\Localizer;

class InsufficientStockException extends DomainException
{
    public static function forProduct(string $productName, int $requested, int $available): self
    {
        return new self(
            __('errors.inventory.insufficient_stock', [
                'product' => $productName,
                'available' => app(Localizer::class)->number($available),
                'requested' => app(Localizer::class)->number($requested),
            ]),
            'inventory.insufficient_stock',
        );
    }

    public static function wouldGoNegative(string $productName, int $resulting): self
    {
        return new self(
            __('errors.inventory.negative_stock', [
                'product' => $productName,
                'resulting' => app(Localizer::class)->number($resulting),
            ]),
            'inventory.negative_stock',
        );
    }

    public static function reasonRequired(): self
    {
        return new self(
            __('errors.inventory.reason_required'),
            'inventory.adjustment_reason_required',
        );
    }
}
