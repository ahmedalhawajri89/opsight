<?php

declare(strict_types=1);

/*
 * الاستيراد من ملف (ADR-039). كل رسالة تقول ما يجب تغييره في الملف، لأن
 * المالك يصلح الملف لا هذه الشاشة.
 */
return [
    'problems' => [
        'empty' => 'الملف لا يحتوي على صفوف.',
        'unreadable' => 'تعذّرت قراءة الملف. احفظه بصيغة CSV أو مصنّف Excel ‏(‎.xlsx‎) وحاول مرّة أخرى.',
        'too_many_rows' => 'يحتوي الملف على أكثر من :max صف. قسّمه إلى ملفات أصغر حسب التاريخ.',
        'mapping_missing' => 'اختر العمود الذي يحتوي على :field.',
        'mapping_duplicate' => 'عمود واحد مختار لحقلين، منهما :field.',
        'mapping_out_of_range' => 'العمود المختار لـ:field غير موجود في هذا الملف.',
    ],

    'errors' => [
        'required' => ':field فارغ.',
        'number' => ':field ليس رقمًا: «:value».',
        'date' => ':field ليس تاريخًا يمكن قراءته: «:value». استخدم 2026-03-05 أو 05/03/2026.',
        'status' => ':field «:value» ليست حالة معروفة. استخدم: مكتمل، مؤكد، ملغي، أو مسودة.',
        'quantity' => ':field يجب أن تكون عددًا صحيحًا أكبر من صفر: «:value».',
        'price_missing' => 'البند بلا سعر وحدة ولا إجمالي.',
        'duplicate' => ':field «:value» مكرّر في الملف.',
    ],

    'fields' => [
        'order_id' => 'رقم الطلب',
        'date' => 'التاريخ',
        'status' => 'الحالة',
        'sku' => 'رمز المنتج',
        'product_name' => 'المنتج',
        'quantity' => 'الكمية',
        'unit_price' => 'سعر الوحدة',
        'line_total' => 'إجمالي البند',
        'customer_name' => 'العميل',
        'customer_phone' => 'الجوال',
        'customer_email' => 'البريد الإلكتروني',
        'shipping' => 'الشحن',
        'tax' => 'الضريبة',
        'discount' => 'الخصم',
        'order_total' => 'إجمالي الطلب',
        'payment_method' => 'طريقة الدفع',
        'name' => 'الاسم',
        'price' => 'السعر',
        'cost' => 'التكلفة',
    ],
];
