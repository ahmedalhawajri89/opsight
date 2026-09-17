<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rejects a session whose user was deactivated after they logged in.
 *
 * Without this, revoking someone's access would only take effect at their next
 * login — which for an 8-hour session means "some time today". Deactivation
 * should be immediate (MVP_SCOPE.md §6.1).
 */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof User && ! $user->is_active) {
            Auth::guard('web')->logout();

            // A stateless request has no session store. Guarding here keeps the
            // middleware safe on any transport rather than only the cookie one.
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json([
                'message' => __('errors.http.account_deactivated'),
                'code' => 'auth.account_deactivated',
            ], 401);
        }

        return $next($request);
    }
}
