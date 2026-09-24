<?php

declare(strict_types=1);

/*
 * التسميات — Labels (Arabic).
 */
return [

    'roles' => [
        'owner' => 'مالك',
        'manager' => 'مدير',
        'analyst' => 'محلل',
        'staff' => 'موظف',
    ],

    'order_status' => [
        'draft' => 'مسودة',
        'confirmed' => 'مؤكَّد',
        'fulfilled' => 'مُنجَز',
        'cancelled' => 'ملغى',
        'refunded' => 'مُسترَد',
    ],

    // تُنشأ مع كل شركة جديدة، بلغة مالكها (ADR-024).
    'default_expense_categories' => [
        'rent' => 'الإيجار',
        'salaries' => 'الرواتب',
        'utilities' => 'المرافق',
        'marketing' => 'التسويق',
        'shipping' => 'الشحن والتوصيل',
        'supplies' => 'المستلزمات',
        'other' => 'أخرى',
    ],

    'payment_method' => [
        'cash' => 'نقدًا',
        'card' => 'بطاقة',
        'bank_transfer' => 'تحويل بنكي',
        'cash_on_delivery' => 'الدفع عند الاستلام',
        'wallet' => 'محفظة رقمية',
        'other' => 'أخرى',
    ],

    'payment_status' => [
        'unpaid' => 'غير مدفوع',
        'partially_paid' => 'مدفوع جزئيًا',
        'settled' => 'مسدَّد',
    ],

    'comparison' => [
        'previous_period' => 'الفترة السابقة',
        'previous_year' => 'الفترة نفسها من العام الماضي',
        'previous_hijri_year' => 'الموسم الهجري نفسه من العام الماضي',
        'none' => 'بدون مقارنة',
    ],

    /*
     * العدد والمعدود: يوم واحد، يومان، ٣–١٠ أيام، ١١ فأكثر يومًا.
     * The counted noun takes a different form for 1, 2, 3–10 and 11+.
     */
    'versus' => [
        'previous_days' => '{1} مقارنة باليوم السابق|{2} مقارنة باليومين السابقين|[3,10] مقارنة بالأيام الـ :days السابقة|[11,*] مقارنة بالـ :days يومًا السابقة',
        'previous_year' => 'مقارنة بالفترة نفسها من العام الماضي',
        'previous_hijri_year' => 'مقارنة بالموسم الهجري نفسه من العام الماضي',
    ],

    'against' => [
        'previous_period' => 'بالفترة السابقة',
        'previous_year' => 'بالفترة نفسها من العام الماضي',
        'previous_hijri_year' => 'بالموسم الهجري نفسه من العام الماضي',
        'none' => 'بدون مقارنة',
    ],

    'empty_reason' => [
        'no_orders_average' => 'لا توجد طلبات في هذه الفترة، فلا يمكن حساب المتوسط.',
        'no_orders' => 'لم تُسجَّل أي طلبات في هذه الفترة.',
        'no_revenue_refund' => 'لا توجد إيرادات في هذه الفترة لاحتساب الاسترداد منها.',
        'no_revenue_margin' => 'لا يوجد صافي إيرادات في هذه الفترة، فلا يوجد هامش.',
    ],

    'breakdown' => [
        'other' => 'أخرى',
        'more' => '{1} منتج واحد إضافي|{2} منتجان إضافيان|[3,10] :count منتجات إضافية|[11,*] :count منتجًا إضافيًا',
    ],

    'boolean' => [
        'true' => 'نعم',
        'false' => 'لا',
    ],

    'csv' => [
        'reference' => 'المرجع',
        'status' => 'الحالة',
        'placed_at' => 'تاريخ الطلب',
        'customer' => 'العميل',
        'customer_email' => 'بريد العميل',
        'subtotal' => 'المجموع الفرعي',
        'discount' => 'الخصم',
        'tax' => 'الضريبة',
        'shipping' => 'الشحن',
        'total' => 'الإجمالي',
        'refunded' => 'المبلغ المسترد',
        'amount_paid' => 'المدفوع',
        'outstanding' => 'المتبقّي',
        'payment_status' => 'حالة الدفع',
        'cogs' => 'تكلفة البضاعة المباعة',
        'gross_profit' => 'مجمل الربح',
        'sku' => 'رمز المنتج',
        'name' => 'الاسم',
        'category' => 'الفئة',
        'unit' => 'الوحدة',
        'price' => 'السعر',
        'cost' => 'التكلفة',
        'stock_on_hand' => 'المخزون المتوفر',
        'reorder_point' => 'حد إعادة الطلب',
        'active' => 'نشط',
        'company' => 'الشركة',
        'email' => 'البريد الإلكتروني',
        'phone' => 'الهاتف',
        'address' => 'العنوان',
        'city' => 'المدينة',
        'country' => 'الدولة',
        'created_at' => 'تاريخ الإنشاء',
        'product' => 'المنتج',
        'below_reorder_point' => 'دون حد إعادة الطلب',
        'last_movement' => 'آخر حركة',
        'incurred_on' => 'تاريخ الصرف',
        'description' => 'الوصف',
        'vendor' => 'المورّد',
        'amount' => 'المبلغ',
        'notes' => 'الملاحظات',
        'occurred_at' => 'وقت الحدوث',
        'action' => 'الإجراء',
        'actor' => 'المنفِّذ',
        'role' => 'الدور',
        'subject' => 'العنصر',
        'subject_id' => 'معرّف العنصر',
        'ip_address' => 'عنوان IP',
    ],

];
