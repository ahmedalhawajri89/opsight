<?php

declare(strict_types=1);

/*
 * Insight sentences (L3).
 *
 * Every figure arrives already formatted in the reader's locale and digits —
 * `:pct` includes its percent sign — so a sentence never formats a number
 * itself. Direction is always in the verb ("fell", "rose"), never in a sign.
 */
return [

    'margin_decline' => [
        'title' => 'Gross margin is down',
        'message' => 'Gross margin fell :points percentage points against :basis.',
        'cause' => 'Cost of goods :cogs_verb :cogs_pct while net revenue :revenue_verb :revenue_pct.',
    ],

    'revenue_drop' => [
        'title' => 'Net revenue is down',
        'message' => 'Net revenue fell :pct against :basis.',
    ],

    'revenue_surge' => [
        'title' => 'Net revenue is up',
        'message' => 'Net revenue rose :pct against :basis.',
        'message_led' => 'Net revenue rose :pct against :basis, led by :category.',
    ],

    'cancellation_spike' => [
        'title' => 'Cancellations are climbing',
        'message' => 'Cancellations reached :rate of orders, up :points percentage points on :basis.',
    ],

    'low_stock' => [
        'title' => 'Stock needs reordering',
        'message' => '{1} :count product is at or below the reorder point, as of now.|[2,*] :count products are at or below the reorder point, as of now.',
    ],

    'stockout_risk' => [
        'title' => 'Products may run out',
        'message' => ':product has about :days days of stock left at its recent sales rate.',
        'others' => '{1} :message (:count other product is close behind)|[2,*] :message (:count other products are close behind)',
    ],

    'customer_concentration' => [
        'title' => 'Revenue is concentrated',
        'message' => ':customer accounts for :pct of net revenue this period.',
        'fallback_customer' => 'One customer',
    ],

    'expense_spike' => [
        'title' => 'Spending rose sharply',
        'message' => ':category spending rose :pct against :basis, and is now :share of net revenue.',
    ],

    'zero_cost_products' => [
        'title' => 'Margin is overstated',
        'message' => '{1} :count sold line item has no recorded cost, so gross profit and margin for this period are higher than the truth.|[2,*] :count sold line items have no recorded cost, so gross profit and margin for this period are higher than the truth.',
    ],

    'dormant_customers' => [
        'title' => 'Customers have gone quiet',
        'message' => ':count customers who used to order have not placed one in :days days.',
    ],

    /*
     * Separate per subject because Arabic verbs agree in gender with their
     * subject: تكلفة (cost) is feminine, صافي الإيرادات (net revenue) masculine.
     * One shared "rose" would be ungrammatical in one of the two clauses.
     */
    'verbs' => [
        'cogs_rose' => 'rose',
        'cogs_fell' => 'fell',
        'revenue_rose' => 'rose',
        'revenue_fell' => 'fell',
    ],

    'suppressed' => [
        'partial_period' => 'This period is still in progress, so trend insights are held back. A part-finished period compared against a complete one reads as a collapse in trade rather than as a period that has barely started. Stock alerts are unaffected — they describe now.',
        'too_few_orders' => 'Fewer than :minimum orders in this period or the one it is compared against, so percentage-based insights are held back. Swings on a handful of orders are noise, and reporting them would make the whole feed harder to trust.',
    ],

];
