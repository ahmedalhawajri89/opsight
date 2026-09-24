<?php

declare(strict_types=1);

namespace App\Domain\Businesses;

use App\Authorization\Role;
use App\Domain\Audit\AuditRecorder;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\ExpenseCategory;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A new business signs itself up (P2 phase 3, ADR-024).
 *
 * One transaction creates the business, its settings, its owner and the
 * expense categories a business needs before it can record a cost, so a
 * failure anywhere leaves nothing behind: no business without an owner, no
 * owner without a business.
 *
 * The settings start at neutral defaults; the setup wizard that follows asks
 * where the business trades and sets currency, week and VAT from that.
 */
final class RegisterBusiness
{
    /** Keys into labels.default_expense_categories, named in the registrant's language. */
    private const EXPENSE_CATEGORIES = ['rent', 'salaries', 'utilities', 'marketing', 'shipping', 'supplies', 'other'];

    public function __construct(private readonly AuditRecorder $recorder) {}

    /**
     * @param  array{business_name: string, name: string, email: string, password: string, locale?: string|null}  $data
     */
    public function __invoke(array $data): User
    {
        $locale = ($data['locale'] ?? null) === 'ar' ? 'ar' : 'en';

        return DB::transaction(function () use ($data, $locale): User {
            $business = Business::query()->create([
                'name' => $data['business_name'],
                'slug' => $this->slugFor($data['business_name']),
            ]);

            CurrentBusiness::get()->set($business->id);

            BusinessSetting::ensureExists(['company_name' => $data['business_name']]);

            $owner = new User([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'locale' => $locale,
            ]);
            // Privilege-bearing, so set here and never mass-assigned (SECURITY.md §6).
            $owner->role = Role::Owner;
            $owner->is_active = true;
            $owner->save();

            foreach (self::EXPENSE_CATEGORIES as $key) {
                ExpenseCategory::query()->create([
                    'name' => trans("labels.default_expense_categories.{$key}", [], $locale),
                    'slug' => $key,
                ]);
            }

            $this->recorder->record(
                action: 'business.registered',
                subject: $business,
                actorId: $owner->id,
                businessId: $business->id,
            );

            return $owner;
        });
    }

    /**
     * Readable where the name allows it, and unique regardless: an Arabic name
     * has no Latin slug, and two businesses may share a name.
     */
    private function slugFor(string $name): string
    {
        $base = Str::limit(Str::slug($name), 60, '');

        return ($base !== '' ? $base : 'business').'-'.Str::lower(Str::random(6));
    }
}
