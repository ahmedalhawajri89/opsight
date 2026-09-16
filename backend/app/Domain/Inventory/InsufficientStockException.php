<?php

declare(strict_types=1);

namespace App\Domain\Inventory;

use App\Support\DomainException;

class InsufficientStockException extends DomainException
{
    public static function forProduct(string $productName, int $requested, int $available): self
    {
        return new self(
            "{$productName} has {$available} in stock but {$requested} were requested.",
            'inventory.insufficient_stock',
        );
    }

    public static function wouldGoNegative(string $productName, int $resulting): self
    {
        return new self(
            "This adjustment would leave {$productName} at {$resulting}. Stock cannot be negative.",
            'inventory.negative_stock',
        );
    }

    public static function reasonRequired(): self
    {
        return new self(
            'A manual stock adjustment requires a reason.',
            'inventory.adjustment_reason_required',
        );
    }
}
