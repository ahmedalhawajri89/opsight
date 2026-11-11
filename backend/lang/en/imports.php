<?php

declare(strict_types=1);

/*
 * Importing from a file (ADR-039). Each message names what to change in the
 * spreadsheet, because the owner fixes the file, not this screen.
 */
return [
    'problems' => [
        'empty' => 'The file has no rows.',
        'unreadable' => 'This file could not be read. Save it as CSV or as an Excel workbook (.xlsx) and try again.',
        'too_many_rows' => 'The file has more than :max rows. Split it into smaller files by date.',
        'too_large' => 'This workbook unpacks to more than fifty megabytes. Save it as CSV, or split it, and try again.',
        'mapping_missing' => 'Choose which column holds :field.',
        'mapping_duplicate' => 'One column is chosen for two fields, including :field.',
        'mapping_out_of_range' => 'The column chosen for :field is not in this file.',
    ],

    'errors' => [
        'required' => ':field is empty.',
        'number' => ':field is not a number: “:value”.',
        'date' => ':field is not a date this import can read: “:value”. Use 2026-03-05 or 05/03/2026.',
        'status' => ':field “:value” is not a status this import knows. Use completed, confirmed, cancelled or draft.',
        'quantity' => ':field must be a whole number above zero: “:value”.',
        'price_missing' => 'The line has neither a unit price nor a line total.',
        'duplicate' => ':field “:value” appears more than once in the file.',
    ],

    'fields' => [
        'order_id' => 'Order number',
        'date' => 'Date',
        'status' => 'Status',
        'sku' => 'SKU',
        'product_name' => 'Product',
        'quantity' => 'Quantity',
        'unit_price' => 'Unit price',
        'line_total' => 'Line total',
        'customer_name' => 'Customer',
        'customer_phone' => 'Phone',
        'customer_email' => 'Email',
        'shipping' => 'Shipping',
        'tax' => 'Tax',
        'discount' => 'Discount',
        'order_total' => 'Order total',
        'payment_method' => 'Payment method',
        'name' => 'Name',
        'price' => 'Price',
        'cost' => 'Cost',
    ],
];
