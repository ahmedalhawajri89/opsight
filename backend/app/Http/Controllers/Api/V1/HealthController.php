<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Unauthenticated liveness and dependency check (ARCHITECTURE.md §11).
 *
 * Reports reachability only. It deliberately exposes no version, no
 * configuration and no error detail — a health endpoint is a public surface.
 */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $checks = [
            'database' => $this->check(static fn () => DB::connection()->getPdo()),
            'queue' => $this->check(static fn () => DB::table('jobs')->exists()),
        ];

        $healthy = ! in_array(false, $checks, strict: true);

        return response()->json([
            'data' => [
                'status' => $healthy ? 'ok' : 'degraded',
                'checks' => $checks,
                'time' => now()->toIso8601String(),
            ],
        ], $healthy ? 200 : 503);
    }

    private function check(callable $probe): bool
    {
        try {
            $probe();

            return true;
        } catch (Throwable) {
            return false;
        }
    }
}
