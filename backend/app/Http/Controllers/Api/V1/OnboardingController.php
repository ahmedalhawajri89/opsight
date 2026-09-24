<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Audit\AuditRecorder;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Business;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * The end of the setup wizard (ADR-024).
 *
 * The wizard saves each step through PATCH /settings as it goes, so a closed
 * tab loses nothing. This records where the business trades and that setup is
 * done, which stops the owner being taken back to the wizard on sign-in.
 */
class OnboardingController extends Controller
{
    public function complete(Request $request, AuditRecorder $recorder): JsonResponse
    {
        Gate::authorize(Ability::SettingsUpdate->value);

        $validated = $request->validate([
            'country' => ['required', 'string', Rule::in(Business::COUNTRIES)],
        ]);

        $user = $request->user();
        assert($user instanceof User);

        $business = Business::query()->findOrFail($user->business_id);

        $business->forceFill([
            'country' => $validated['country'],
            'onboarded_at' => $business->onboarded_at ?? now(),
        ])->save();

        $recorder->record(
            action: 'business.onboarded',
            subject: $business,
            context: ['country' => $validated['country']],
        );

        // The business just saved, not one the user object may already hold,
        // and 200: an update, whatever the user object remembers of its own
        // creation.
        $user->setRelation('business', $business);

        return UserResource::make($user)->response()->setStatusCode(200);
    }
}
