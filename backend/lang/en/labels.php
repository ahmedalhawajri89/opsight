<?php

declare(strict_types=1);

/*
 * Labels the server attaches to data: roles, statuses, comparison phrases,
 * empty-value reasons, breakdown rows and CSV column headers.
 */
return [

    'roles' => [
        'owner' => 'Owner',
        'manager' => 'Manager',
        'analyst' => 'Analyst',
        'staff' => 'Staff',
    ],

    'order_status' => [
        'draft' => 'Draft',
        'confirmed' => 'Confirmed',
        'fulfilled' => 'Fulfilled',
        'cancelled' => 'Cancelled',
        'refunded' => 'Refunded',
    ],

    // Created with every new business, named in its owner's language (ADR-024).
    'default_expense_categories' => [
        'rent' => 'Rent',
        'salaries' => 'Salaries',
        'utilities' => 'Utilities',
        'marketing' => 'Marketing',
        'shipping' => 'Shipping and delivery',
        'supplies' => 'Supplies',
        'other' => 'Other',
    ],

    'payment_method' => [
        'cash' => 'Cash',
        'card' => 'Card',
        'bank_transfer' => 'Bank transfer',
        'cash_on_delivery' => 'Cash on delivery',
        'wallet' => 'Digital wallet',
        'other' => 'Other',
    ],

    'payment_status' => [
        'unpaid' => 'Unpaid',
        'partially_paid' => 'Partially paid',
        'settled' => 'Settled',
    ],

    'comparison' => [
        'previous_period' => 'Previous period',
        'previous_year' => 'Same period last year',
        'previous_hijri_year' => 'Same Hijri dates last year',
        'none' => 'No comparison',
    ],

    /*
     * The phrase beside every figure. `:days` is the formatted count; the
     * choice between forms follows the number itself, which English barely
     * needs and Arabic needs six ways.
     */
    'versus' => [
        'previous_days' => '{1} vs previous day|[2,*] vs previous :days days',
        'previous_year' => 'vs same period last year',
        'previous_hijri_year' => 'vs the same Hijri dates last year',
    ],

    /* "…against the previous period." inside a sentence. */
    'against' => [
        'previous_period' => 'the previous period',
        'previous_year' => 'the same period last year',
        'previous_hijri_year' => 'the same Hijri dates last year',
        'none' => 'no comparison',
    ],

    'empty_reason' => [
        'no_orders_average' => 'No orders in this period, so there is no average to compute.',
        'no_orders' => 'No orders were placed in this period.',
        'no_revenue_refund' => 'No revenue in this period to refund against.',
        'no_revenue_margin' => 'No net revenue in this period, so there is no margin.',
    ],

    'breakdown' => [
        'other' => 'Other',
        'more' => '{1} :count more|[2,*] :count more',
    ],

    'boolean' => [
        'true' => 'Yes',
        'false' => 'No',
    ],

    'csv' => [
        'reference' => 'Reference',
        'status' => 'Status',
        'placed_at' => 'Placed at',
        'customer' => 'Customer',
        'customer_email' => 'Customer email',
        'subtotal' => 'Subtotal',
        'discount' => 'Discount',
        'tax' => 'Tax',
        'shipping' => 'Shipping',
        'total' => 'Total',
        'refunded' => 'Refunded',
        'amount_paid' => 'Paid',
        'outstanding' => 'Outstanding',
        'payment_status' => 'Payment status',
        'cogs' => 'Cost of goods',
        'gross_profit' => 'Gross profit',
        'sku' => 'SKU',
        'name' => 'Name',
        'category' => 'Category',
        'unit' => 'Unit',
        'price' => 'Price',
        'cost' => 'Cost',
        'stock_on_hand' => 'Stock on hand',
        'reorder_point' => 'Reorder point',
        'active' => 'Active',
        'company' => 'Company',
        'email' => 'Email',
        'phone' => 'Phone',
        'address' => 'Address',
        'city' => 'City',
        'country' => 'Country',
        'created_at' => 'Created at',
        'product' => 'Product',
        'below_reorder_point' => 'Below reorder point',
        'last_movement' => 'Last movement',
        'incurred_on' => 'Incurred on',
        'description' => 'Description',
        'vendor' => 'Vendor',
        'amount' => 'Amount',
        'notes' => 'Notes',
        'occurred_at' => 'Occurred at',
        'action' => 'Action',
        'actor' => 'Actor',
        'role' => 'Role',
        'subject' => 'Subject',
        'subject_id' => 'Subject id',
        'ip_address' => 'IP address',
    ],

];
