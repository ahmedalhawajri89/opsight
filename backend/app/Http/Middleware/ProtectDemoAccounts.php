<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * In the public demo, refuses any change to a demo account's sign-in, role or
 * status (config/demo.php).
 *
 * The demo is shared: a visitor who changed the Owner's password, or
 * deactivated the Manager, would lock every later visitor out of that role
 * until the nightly reset. Everything else stays open, including adding users
 * of one's own and changing theirs. Outside the demo this does nothing.
 */
class ProtectDemoAccounts
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('demo.enabled') || $request->isMethodSafe()) {
            return $next($request);
        }

        $target = $request->routeIs('me.password') ? $request->user() : $request->route('user');

        if ($target instanceof User && in_array(strtolower($target->email), config('demo.accounts'), true)) {
            return response()->json([
                'message' => __('errors.http.demo_account_protected'),
                'code' => 'demo.account_protected',
            ], 403);
        }

        return $next($request);
    }
}
