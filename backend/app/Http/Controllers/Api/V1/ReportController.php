<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Audit\AuditRecorder;
use App\Domain\Reports\FinancingReport;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reports for people outside the business (phase D3).
 *
 * The financing report is the business's whole financial picture in one
 * document, made to leave the building. So it is for a role that may see
 * cost, and every time one is drawn up the activity log says who did it.
 */
class ReportController extends Controller
{
    public function financing(Request $request, FinancingReport $report, AuditRecorder $recorder): JsonResponse
    {
        $user = $request->user();

        if (! ($user?->can(Ability::MetricsViewCost->value) ?? false)) {
            abort(403);
        }

        $data = $report->for($user);

        $recorder->record(action: 'report.financing_generated', context: ['period' => $data['period']]);

        return response()->json(['data' => $data]);
    }
}
