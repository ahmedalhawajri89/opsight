<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

/**
 * Laravel 12 ships a bare base controller. AuthorizesRequests is added here
 * because EVERY controller action in this application authorizes — that is the
 * default-deny rule, and it would be a poor one if each controller had to
 * remember to import the trait first (SECURITY.md §2.1).
 */
abstract class Controller
{
    use AuthorizesRequests;
}
