<?php

declare(strict_types=1);

namespace App\Domain\Compliance;

use App\Domain\Audit\AuditRecorder;
use App\Models\ActivityLog;
use App\Models\Customer;
use Illuminate\Support\Facades\DB;

/**
 * Forgetting a person while keeping the business record (ADR-026).
 *
 * ERASURE IS ANONYMISATION, NOT DELETION, and the distinction is the whole
 * design. Every revenue figure in this system is computed from `orders`, so
 * removing the orders would restate history; and `deleted_at` on a customer is
 * read by `MetricCalculator::dormantCustomerCount()` and by `QuickStats`'s
 * customer-growth tile, so soft-deleting them would move numbers that describe
 * trade, not people. What a data-subject request asks for is that the person
 * stop being identifiable — not that last March stop having happened.
 *
 * So the orders stay, untouched, and the person is overwritten in place. A
 * test holds `MetricSummary` byte-identical across an erasure, and a second
 * test shows a soft delete of the same customer DOES move the figures, so the
 * first one cannot pass vacuously.
 *
 * What visibly changes: the customer dimension of a breakdown keeps its value
 * and loses its label — the row still earned what it earned, under a
 * pseudonym. That is correct, and it is named here so nobody files it as a
 * bug.
 */
final class EraseCustomer
{
    /**
     * Everything on a customer that identifies the person behind it.
     *
     * `country` is deliberately absent: it names no one, it is the only
     * geography the commercial record keeps, and the customer list filters on
     * it. `company` and `city` ARE here — a sole trader's company is often
     * their own name, and a city in a small market narrows a person to very
     * few.
     *
     * @var list<string>
     */
    public const PII_COLUMNS = [
        'name', 'name_ar', 'email', 'phone', 'company',
        'vat_number', 'address_line', 'city', 'notes',
    ];

    public function __construct(
        private readonly AuditRecorder $recorder,
        private readonly ScrubActivityLog $scrub,
    ) {}

    public function __invoke(Customer $customer, string $reason): Customer
    {
        if ($customer->erased_at !== null) {
            throw CustomerAlreadyErased::make();
        }

        return DB::transaction(function () use ($customer, $reason): Customer {
            $original = $customer->only(self::PII_COLUMNS);

            $customer->forceFill($this->replacements());

            /*
             * withoutAudit(), then an explicit record below.
             *
             * AuditRecorder::diff() builds `before` from getRawOriginal(), so
             * letting the observer run would write this person's name, email,
             * phone and address straight back into the append-only table — in
             * the same transaction that is scrubbing them out of it. The
             * redactor would not catch it: its list is passwords and tokens,
             * not customer details.
             */
            $customer->withoutAudit()->save();

            $scrubbed = $this->scrubHistory($customer, $original);

            $this->recorder->record(
                action: 'customer.erased',
                subject: $customer,
                // Never a diff. Here the diff IS the data being erased.
                changes: null,
                context: [
                    'reason' => $reason,
                    'fields' => self::PII_COLUMNS,
                    'activity_rows_scrubbed' => $scrubbed,
                ],
            );

            return $customer->refresh();
        });
    }

    /**
     * What each identifying column becomes.
     *
     * The name is a fixed sentinel because it is NOT NULL, and it is
     * language-neutral on purpose: a translated string would freeze the
     * erasing operator's language into the row for ever. The screen reads
     * `erased_at` and writes its own words.
     *
     * The email becomes NULL rather than a sentinel because the unique index
     * is `(business_id, email)` — a second erasure in the same business would
     * collide on a shared sentinel, and NULLs do not collide.
     *
     * `deleted_at` is untouched, and so is `created_at`: see the class note.
     *
     * @return array<string, mixed>
     */
    private function replacements(): array
    {
        return [
            'name' => ScrubActivityLog::SENTINEL,
            'name_ar' => null,
            'email' => null,
            'phone' => null,
            'company' => null,
            'vat_number' => null,
            'address_line' => null,
            'city' => null,
            'notes' => null,
            'is_active' => false,
            'erased_at' => now(),
        ];
    }

    /**
     * Remove the person from the audit log, leaving the audit (ADR-026).
     *
     * @param  array<string, mixed>  $original
     * @return int rows rewritten
     */
    private function scrubHistory(Customer $customer, array $original): int
    {
        $rewritten = 0;
        $alreadyScrubbed = [];

        /*
         * Pass A — every row whose subject IS this customer. Deterministic:
         * `customer.created` holds the whole attribute set in `changes.after`,
         * `customer.updated` holds the changed keys in `before` and `after`.
         */
        ActivityLog::query()
            ->where('subject_type', 'Customer')
            ->where('subject_id', $customer->getKey())
            ->whereNotNull('changes')
            ->chunkById(500, function ($rows) use (&$rewritten, &$alreadyScrubbed): void {
                foreach ($rows as $row) {
                    $row->changes = $this->scrub->byKey($row->changes, self::PII_COLUMNS);
                    $row->save();
                    $alreadyScrubbed[$row->getKey()] = true;
                    $rewritten++;
                }
            });

        /*
         * Pass B — rows that mention the person without naming them as a
         * subject. The real case is `export.generated`, whose `context.filters`
         * carries whatever a colleague typed into the search box, with no
         * subject id to find it by.
         *
         * A LIKE scan, not JSON_SEARCH: that function matches whole string
         * VALUES and would miss an email sitting inside a longer filter, and
         * LIKE behaves the same on MySQL's native JSON type and MariaDB's
         * LONGTEXT backing. Unindexable and O(table) by nature — accepted
         * because an erasure is a rare, human-initiated act (ADR-026 amends
         * ADR-011's revisit trigger accordingly).
         */
        $needles = $this->scrub->needles($original);

        if ($needles === []) {
            return $rewritten;
        }

        /*
         * Pass A's rows are skipped in PHP, not excluded in SQL.
         *
         * The SQL exclusion was `NOT (subject_type = 'Customer' AND subject_id
         * = ?)`, which looks right and is wrong: an export row has a NULL
         * subject_type, `NULL = 'Customer'` is NULL, and `NOT NULL` is NULL —
         * not true — so three-valued logic quietly dropped exactly the rows
         * this pass exists to reach. A test caught it.
         */
        ActivityLog::query()
            ->where(function ($query) use ($needles): void {
                foreach ($needles as $needle) {
                    $like = '%'.addcslashes($needle, '%_\\').'%';
                    $query->orWhere('changes', 'like', $like)
                        ->orWhere('context', 'like', $like);
                }
            })
            ->chunkById(500, function ($rows) use ($needles, &$rewritten, $alreadyScrubbed): void {
                foreach ($rows as $row) {
                    if (isset($alreadyScrubbed[$row->getKey()])) {
                        continue;
                    }

                    $row->changes = $this->scrub->byValue($row->changes, $needles);
                    $row->context = $this->scrub->byValue($row->context, $needles);
                    $row->save();
                    $rewritten++;
                }
            });

        return $rewritten;
    }
}
