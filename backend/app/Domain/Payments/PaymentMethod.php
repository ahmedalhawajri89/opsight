<?php

declare(strict_types=1);

namespace App\Domain\Payments;

/**
 * How a payment was received (ADR-022).
 *
 * Deliberately few, and by kind rather than by brand: "card" covers Mada,
 * Visa and Apple Pay alike, "wallet" covers STC Pay, BenefitPay and the rest.
 * Opsight records that money arrived and how; it does not take payments, so it
 * has no reason to know which network carried them.
 */
enum PaymentMethod: string
{
    case Cash = 'cash';
    case Card = 'card';
    case BankTransfer = 'bank_transfer';
    case CashOnDelivery = 'cash_on_delivery';
    case Wallet = 'wallet';
    case Other = 'other';

    public function label(): string
    {
        return __('labels.payment_method.'.$this->value);
    }
}
