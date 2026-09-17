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

];
