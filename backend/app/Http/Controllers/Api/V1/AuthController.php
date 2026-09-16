<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Sanctum SPA (stateful cookie) authentication — ADR-002.
 *
 * No token is created or returned. The session lives in an HttpOnly cookie
 * that JavaScript cannot read, which is the entire point of the choice.
 */
class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $request->authenticate();

        // Regenerate on login to defend against session fixation.
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        $user = $request->user();
        assert($user instanceof User);

        $user->forceFill(['last_login_at' => now()])->save();

        return UserResource::make($user)
            ->response()
            ->setStatusCode(200);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(null, 204);
    }

    /**
     * The authenticated user and their resolved abilities.
     * The frontend calls this on mount to establish session state.
     */
    public function me(Request $request): UserResource
    {
        $user = $request->user();
        assert($user instanceof User);

        return UserResource::make($user);
    }
}
