<?php

declare(strict_types=1);

/*
 * Authentication (Arabic).
 *
 * `failed` is deliberately identical for an unknown email and a wrong password,
 * in every language: distinguishing them turns the sign-in form into a way to
 * discover which addresses have accounts (SECURITY.md §7).
 */
return [

    'failed' => 'بيانات الدخول غير صحيحة.',
    'password' => 'كلمة المرور غير صحيحة.',
    'throttle' => 'محاولات دخول كثيرة. يُرجى المحاولة مجددًا بعد :seconds ثانية.',

    'google_failed' => 'تعذّر على Google تأكيد تسجيل الدخول هذا. حاول مجددًا، أو سجّل الدخول بكلمة المرور.',
    'google_no_account' => 'لا يوجد حساب نشط في بيدر بعنوان Google هذا. سجّل الدخول بكلمة المرور، أو اطلب من المالك إضافة هذا العنوان.',
    'google_unverified' => 'لهذا العنوان حساب في بيدر لم يُؤكَّد بعد. افتح رابط التأكيد في بريدك، أو أعد تعيين كلمة المرور من «نسيت كلمة المرور»، ثم ادخل بـ Google.',

    /*
     * A forgotten password. `reset_link_sent` is the same sentence whether or
     * not the address has an account (PasswordResetController).
     */
    'reset_link_sent' => 'إن كان هذا العنوان مرتبطًا بحساب، فرابط اختيار كلمة مرور جديدة في طريقه إليك. صالح لمدة ساعة.',
    'reset_invalid' => 'انتهت صلاحية هذا الرابط أو استُخدم من قبل. اطلب رابطًا جديدًا.',
    'reset_done' => 'تم تغيير كلمة المرور. سجّل الدخول بالكلمة الجديدة.',
    'reset_mail' => [
        'subject' => 'اختر كلمة مرور جديدة لحسابك في بيدر',
        'greeting' => 'مرحبًا،',
        'intro' => 'طلب أحدهم إعادة تعيين كلمة المرور لهذا الحساب. إن كنت أنت، فاختر كلمة جديدة من هنا.',
        'action' => 'اختيار كلمة مرور جديدة',
        'expires' => 'الرابط صالح لمدة :minutes دقيقة، ولمرة واحدة فقط.',
        'ignore' => 'إن لم تطلب ذلك فتجاهل هذه الرسالة، وستبقى كلمة مرورك كما هي.',
        'salutation' => 'بيدر',
    ],

    'verify_invalid' => 'رابط التأكيد هذا لم يعد صالحًا. سجّل الدخول واطلب رابطًا جديدًا.',
    'verify_done' => 'تم تأكيد بريدك الإلكتروني.',
    'verify_sent' => 'أرسلنا رابط التأكيد إلى بريدك الإلكتروني.',
    'verify_mail' => [
        'subject' => 'أكّد بريدك الإلكتروني في بيدر',
        'greeting' => 'مرحبًا،',
        'intro' => 'أكّد أن هذا العنوان لك، ليرسل إليه بيدر موجزك الصباحي وتستطيع الدخول بـ Google.',
        'action' => 'تأكيد بريدي الإلكتروني',
        'expires' => 'الرابط صالح لمدة :days أيام.',
        'ignore' => 'إن لم تفتح حسابًا في بيدر فتجاهل هذه الرسالة، ولن يصلك منا شيء.',
        'salutation' => 'بيدر',
    ],

];
