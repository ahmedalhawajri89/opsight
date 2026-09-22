<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| رسائل التحقق — Validation messages (Arabic)
|--------------------------------------------------------------------------
|
| Mirrors lang/en/validation.php key for key; tests/Unit/Localization/
| TranslationParityTest fails if either file gains a key the other lacks, or
| if a message loses a placeholder its English counterpart carries.
|
| Written for a business user, in Modern Standard Arabic, in the register of
| Gulf accounting and ERP software: direct, and without the literal calque of
| "The :attribute field must…" that machine translation produces.
|
*/

return [

    'accepted' => 'يجب قبول :attribute.',
    'accepted_if' => 'يجب قبول :attribute عندما يكون :other هو :value.',
    'active_url' => 'يجب أن يكون :attribute رابطًا صالحًا.',
    'after' => 'يجب أن يكون :attribute تاريخًا بعد :date.',
    'after_or_equal' => 'يجب أن يكون :attribute تاريخًا بعد :date أو مساويًا له.',
    'alpha' => 'يجب أن يحتوي :attribute على أحرف فقط.',
    'alpha_dash' => 'يجب أن يحتوي :attribute على أحرف وأرقام وشرطات وشرطات سفلية فقط.',
    'alpha_num' => 'يجب أن يحتوي :attribute على أحرف وأرقام فقط.',
    'any_of' => 'قيمة :attribute غير صالحة.',
    'array' => 'يجب أن يكون :attribute مصفوفة.',
    'ascii' => 'يجب أن يحتوي :attribute على أحرف وأرقام ورموز إنجليزية أحادية البايت فقط.',
    'before' => 'يجب أن يكون :attribute تاريخًا قبل :date.',
    'before_or_equal' => 'يجب أن يكون :attribute تاريخًا قبل :date أو مساويًا له.',
    'between' => [
        'array' => 'يجب أن يحتوي :attribute على ما بين :min و:max عنصرًا.',
        'file' => 'يجب أن يكون حجم :attribute ما بين :min و:max كيلوبايت.',
        'numeric' => 'يجب أن تكون قيمة :attribute ما بين :min و:max.',
        'string' => 'يجب أن يكون طول :attribute ما بين :min و:max حرفًا.',
    ],
    'boolean' => 'يجب أن تكون قيمة :attribute صحيحة أو خاطئة.',
    'can' => 'يحتوي :attribute على قيمة غير مصرّح بها.',
    'confirmed' => 'تأكيد :attribute غير مطابق.',
    'contains' => 'ينقص :attribute قيمة مطلوبة.',
    'current_password' => 'كلمة المرور غير صحيحة.',
    'date' => 'يجب أن يكون :attribute تاريخًا صالحًا.',
    'date_equals' => 'يجب أن يكون :attribute تاريخًا مساويًا لـ :date.',
    'date_format' => 'يجب أن يطابق :attribute الصيغة :format.',
    'decimal' => 'يجب أن يحتوي :attribute على :decimal منزلة عشرية.',
    'declined' => 'يجب رفض :attribute.',
    'declined_if' => 'يجب رفض :attribute عندما يكون :other هو :value.',
    'different' => 'يجب أن يختلف :attribute عن :other.',
    'digits' => 'يجب أن يتكون :attribute من :digits رقمًا.',
    'digits_between' => 'يجب أن يتكون :attribute من :min إلى :max رقمًا.',
    'dimensions' => 'أبعاد صورة :attribute غير صالحة.',
    'distinct' => 'يحتوي :attribute على قيمة مكررة.',
    'doesnt_contain' => 'يجب ألا يحتوي :attribute على أي من القيم التالية: :values.',
    'doesnt_end_with' => 'يجب ألا ينتهي :attribute بأي من القيم التالية: :values.',
    'doesnt_start_with' => 'يجب ألا يبدأ :attribute بأي من القيم التالية: :values.',
    'email' => 'يجب أن يكون :attribute عنوان بريد إلكتروني صالحًا.',
    'encoding' => 'يجب أن يكون :attribute بترميز :encoding.',
    'ends_with' => 'يجب أن ينتهي :attribute بإحدى القيم التالية: :values.',
    'enum' => 'القيمة المختارة لـ :attribute غير صالحة.',
    'exists' => 'القيمة المختارة لـ :attribute غير موجودة.',
    'extensions' => 'يجب أن يكون امتداد :attribute أحد الامتدادات التالية: :values.',
    'file' => 'يجب أن يكون :attribute ملفًا.',
    'filled' => 'يجب أن يحتوي :attribute على قيمة.',
    'gt' => [
        'array' => 'يجب أن يحتوي :attribute على أكثر من :value عنصرًا.',
        'file' => 'يجب أن يكون حجم :attribute أكبر من :value كيلوبايت.',
        'numeric' => 'يجب أن تكون قيمة :attribute أكبر من :value.',
        'string' => 'يجب أن يكون طول :attribute أكثر من :value حرفًا.',
    ],
    'gte' => [
        'array' => 'يجب أن يحتوي :attribute على :value عنصرًا أو أكثر.',
        'file' => 'يجب أن يكون حجم :attribute :value كيلوبايت أو أكثر.',
        'numeric' => 'يجب أن تكون قيمة :attribute :value أو أكثر.',
        'string' => 'يجب أن يكون طول :attribute :value حرفًا أو أكثر.',
    ],
    'hex_color' => 'يجب أن يكون :attribute لونًا سداسي عشري صالحًا.',
    'image' => 'يجب أن يكون :attribute صورة.',
    'in' => 'القيمة المختارة لـ :attribute غير صالحة.',
    'in_array' => 'يجب أن تكون قيمة :attribute موجودة في :other.',
    'in_array_keys' => 'يجب أن يحتوي :attribute على مفتاح واحد على الأقل من: :values.',
    'integer' => 'يجب أن يكون :attribute عددًا صحيحًا.',
    'ip' => 'يجب أن يكون :attribute عنوان IP صالحًا.',
    'ipv4' => 'يجب أن يكون :attribute عنوان IPv4 صالحًا.',
    'ipv6' => 'يجب أن يكون :attribute عنوان IPv6 صالحًا.',
    'json' => 'يجب أن يكون :attribute نصًا بصيغة JSON صالحة.',
    'list' => 'يجب أن يكون :attribute قائمة.',
    'lowercase' => 'يجب أن يكون :attribute بأحرف صغيرة.',
    'lt' => [
        'array' => 'يجب أن يحتوي :attribute على أقل من :value عنصرًا.',
        'file' => 'يجب أن يكون حجم :attribute أقل من :value كيلوبايت.',
        'numeric' => 'يجب أن تكون قيمة :attribute أقل من :value.',
        'string' => 'يجب أن يكون طول :attribute أقل من :value حرفًا.',
    ],
    'lte' => [
        'array' => 'يجب ألا يحتوي :attribute على أكثر من :value عنصرًا.',
        'file' => 'يجب أن يكون حجم :attribute :value كيلوبايت أو أقل.',
        'numeric' => 'يجب أن تكون قيمة :attribute :value أو أقل.',
        'string' => 'يجب أن يكون طول :attribute :value حرفًا أو أقل.',
    ],
    'mac_address' => 'يجب أن يكون :attribute عنوان MAC صالحًا.',
    'max' => [
        'array' => 'يجب ألا يحتوي :attribute على أكثر من :max عنصرًا.',
        'file' => 'يجب ألا يتجاوز حجم :attribute :max كيلوبايت.',
        'numeric' => 'يجب ألا تتجاوز قيمة :attribute :max.',
        'string' => 'يجب ألا يتجاوز طول :attribute :max حرفًا.',
    ],
    'max_digits' => 'يجب ألا يتجاوز :attribute :max رقمًا.',
    'mimes' => 'يجب أن يكون :attribute ملفًا من نوع: :values.',
    'mimetypes' => 'يجب أن يكون :attribute ملفًا من نوع: :values.',
    'min' => [
        'array' => 'يجب أن يحتوي :attribute على :min عنصرًا على الأقل.',
        'file' => 'يجب ألا يقل حجم :attribute عن :min كيلوبايت.',
        'numeric' => 'يجب ألا تقل قيمة :attribute عن :min.',
        'string' => 'يجب ألا يقل طول :attribute عن :min حرفًا.',
    ],
    'min_digits' => 'يجب أن يتكون :attribute من :min رقمًا على الأقل.',
    'missing' => 'يجب ألا يُرسل :attribute.',
    'missing_if' => 'يجب ألا يُرسل :attribute عندما يكون :other هو :value.',
    'missing_unless' => 'يجب ألا يُرسل :attribute ما لم يكن :other هو :value.',
    'missing_with' => 'يجب ألا يُرسل :attribute عند وجود :values.',
    'missing_with_all' => 'يجب ألا يُرسل :attribute عند وجود :values.',
    'multiple_of' => 'يجب أن تكون قيمة :attribute من مضاعفات :value.',
    'not_in' => 'القيمة المختارة لـ :attribute غير صالحة.',
    'not_regex' => 'صيغة :attribute غير صالحة.',
    'numeric' => 'يجب أن يكون :attribute رقمًا.',
    'password' => [
        'letters' => 'يجب أن تحتوي :attribute على حرف واحد على الأقل.',
        'mixed' => 'يجب أن تحتوي :attribute على حرف كبير وحرف صغير على الأقل.',
        'numbers' => 'يجب أن تحتوي :attribute على رقم واحد على الأقل.',
        'symbols' => 'يجب أن تحتوي :attribute على رمز واحد على الأقل.',
        'uncompromised' => 'ظهرت :attribute المدخلة في تسريب بيانات سابق. يُرجى اختيار :attribute أخرى.',
    ],
    'present' => 'يجب إرسال :attribute.',
    'present_if' => 'يجب إرسال :attribute عندما يكون :other هو :value.',
    'present_unless' => 'يجب إرسال :attribute ما لم يكن :other هو :value.',
    'present_with' => 'يجب إرسال :attribute عند وجود :values.',
    'present_with_all' => 'يجب إرسال :attribute عند وجود :values.',
    'prohibited' => ':attribute غير مسموح به.',
    'prohibited_if' => ':attribute غير مسموح به عندما يكون :other هو :value.',
    'prohibited_if_accepted' => ':attribute غير مسموح به عند قبول :other.',
    'prohibited_if_declined' => ':attribute غير مسموح به عند رفض :other.',
    'prohibited_unless' => ':attribute غير مسموح به ما لم يكن :other ضمن :values.',
    'prohibits' => 'يمنع :attribute وجود :other.',
    'regex' => 'صيغة :attribute غير صالحة.',
    'required' => 'حقل :attribute مطلوب.',
    'required_array_keys' => 'يجب أن يحتوي :attribute على مدخلات لكل من: :values.',
    'required_if' => 'حقل :attribute مطلوب عندما يكون :other هو :value.',
    'required_if_accepted' => 'حقل :attribute مطلوب عند قبول :other.',
    'required_if_declined' => 'حقل :attribute مطلوب عند رفض :other.',
    'required_unless' => 'حقل :attribute مطلوب ما لم يكن :other ضمن :values.',
    'required_with' => 'حقل :attribute مطلوب عند وجود :values.',
    'required_with_all' => 'حقل :attribute مطلوب عند وجود :values.',
    'required_without' => 'حقل :attribute مطلوب عند عدم وجود :values.',
    'required_without_all' => 'حقل :attribute مطلوب عند عدم وجود أي من :values.',
    'same' => 'يجب أن يتطابق :attribute مع :other.',
    'size' => [
        'array' => 'يجب أن يحتوي :attribute على :size عنصرًا.',
        'file' => 'يجب أن يكون حجم :attribute :size كيلوبايت.',
        'numeric' => 'يجب أن تكون قيمة :attribute :size.',
        'string' => 'يجب أن يكون طول :attribute :size حرفًا.',
    ],
    'starts_with' => 'يجب أن يبدأ :attribute بإحدى القيم التالية: :values.',
    'string' => 'يجب أن يكون :attribute نصًا.',
    'timezone' => 'يجب أن يكون :attribute منطقة زمنية صالحة.',
    'unique' => 'قيمة :attribute مستخدمة من قبل.',
    'uploaded' => 'تعذّر رفع :attribute.',
    'uppercase' => 'يجب أن يكون :attribute بأحرف كبيرة.',
    'url' => 'يجب أن يكون :attribute رابطًا صالحًا.',
    'ulid' => 'يجب أن يكون :attribute معرّف ULID صالحًا.',
    'uuid' => 'يجب أن يكون :attribute معرّف UUID صالحًا.',

    /*
    |--------------------------------------------------------------------------
    | Custom validation messages
    |--------------------------------------------------------------------------
    */

    'custom' => [
        'attribute-name' => [
            'rule-name' => 'رسالة مخصصة',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Attribute names
    |--------------------------------------------------------------------------
    |
    | Without these every Arabic message would name the field by its English
    | column — "حقل email مطلوب" — which reads as a system leaking its
    | internals. Every field the API validates is named here.
    |
    */

    'attributes' => [
        'email' => 'البريد الإلكتروني',
        'password' => 'كلمة المرور',
        'remember' => 'تذكّرني',
        'name' => 'الاسم',
        'role' => 'الدور',
        'locale' => 'اللغة',
        'numerals' => 'نظام الأرقام',
        'company' => 'الشركة',
        'company_name' => 'اسم الشركة',
        'phone' => 'الهاتف',
        'address_line' => 'العنوان',
        'city' => 'المدينة',
        'country' => 'الدولة',
        'notes' => 'الملاحظات',
        'sku' => 'رمز المنتج',
        'description' => 'الوصف',
        'unit' => 'الوحدة',
        'price' => 'السعر',
        'cost' => 'التكلفة',
        'category_id' => 'الفئة',
        'expense_category_id' => 'فئة المصروف',
        'reorder_point' => 'حد إعادة الطلب',
        'low_stock_threshold' => 'حد المخزون المنخفض',
        'default_low_stock_threshold' => 'حد المخزون المنخفض الافتراضي',
        'amount' => 'المبلغ',
        'incurred_on' => 'تاريخ الصرف',
        'vendor' => 'المورّد',
        'reference' => 'المرجع',
        'customer_id' => 'العميل',
        'product_id' => 'المنتج',
        'quantity' => 'الكمية',
        'line_discount' => 'خصم البند',
        'discount_amount' => 'مبلغ الخصم',
        'tax_amount' => 'مبلغ الضريبة',
        'shipping_amount' => 'مبلغ الشحن',
        'reason' => 'السبب',
        'delta' => 'مقدار التعديل',
        'note' => 'الملاحظة',
        'currency' => 'العملة',
        'currency_decimals' => 'المنازل العشرية',
        'timezone' => 'المنطقة الزمنية',
        'fiscal_year_start_month' => 'شهر بداية السنة المالية',
        'preset' => 'الفترة',
        'from' => 'تاريخ البداية',
        'to' => 'تاريخ النهاية',
        'comparison' => 'أساس المقارنة',
        'metric' => 'المؤشر',
        'grain' => 'دقة التجميع',
        'dimension' => 'بُعد التقسيم',
        'filter' => 'عامل التصفية',
        'sort' => 'الترتيب',
    ],

];
