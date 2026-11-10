<?php

declare(strict_types=1);

namespace App\Domain\Imports;

use App\Domain\Audit\AuditRecorder;
use App\Domain\Integrations\Import\ImportedCustomer;
use App\Domain\Integrations\Import\ImportedLine;
use App\Domain\Integrations\Import\ImportedOrder;
use App\Domain\Integrations\Import\ImportedPayment;
use App\Domain\Integrations\Import\ImportedProduct;
use App\Domain\Integrations\Import\RecordImportedOrder;
use App\Domain\Integrations\Import\RecordImportedProduct;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use App\Models\BusinessSetting;
use App\Support\Money;
use App\Support\PhoneNumber;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Orders or products from a merchant's own file (ADR-039).
 *
 * For the merchant with no store to connect: a shop that sells over
 * WhatsApp and Instagram and keeps its orders in a spreadsheet. The file
 * becomes the same ImportedOrder that Salla and Zid produce, and the same
 * writer records it, so every rule those share applies here too:
 * idempotency, stock left alone, an erased customer kept erased.
 *
 * ALL OR NOTHING. Every row is read and checked before anything is written,
 * and the writing is one transaction. A file with one bad row in four
 * thousand imports nothing and says which row. Half an import is the worst
 * outcome, because the owner cannot tell which half they have.
 *
 * AND SAFE TO RUN AGAIN. The order number is the identity (`source` =
 * 'file', `external_id` = the number), so fixing the file and uploading it
 * again updates the same orders rather than adding a second copy.
 */
final class FileImport
{
    public const SOURCE = 'file';

    /** Errors reported back; a file with more has a column mapped wrongly. */
    public const MAX_ERRORS = 100;

    /** A local number is read as belonging to the business's own country. */
    private const COUNTRY_BY_CURRENCY = ['SAR' => 'SA', 'AED' => 'AE', 'BHD' => 'BH', 'KWD' => 'KW', 'QAR' => 'QA', 'OMR' => 'OM', 'EGP' => 'EG', 'JOD' => 'JO'];

    /** @var list<array{row: int, field: string|null, key: string, value: string|null}> */
    private array $errors = [];

    private int $errorCount = 0;

    public function __construct(
        private readonly SheetReader $reader,
        private readonly RecordImportedOrder $orders,
        private readonly RecordImportedProduct $products,
        private readonly AuditRecorder $recorder,
    ) {}

    /**
     * The file's columns, a few rows, and a suggested mapping.
     *
     * @return array{headers: list<string>, sample: list<list<string>>, mapping: array<string, int|null>, rows: int, fields: array<string, bool>}
     */
    public function preview(string $path, string $extension, string $kind): array
    {
        $sheet = $this->reader->read($path, $extension);

        return [
            'headers' => $sheet['headers'],
            'sample' => array_slice($sheet['rows'], 0, 5),
            'mapping' => ImportFields::suggest($kind, $sheet['headers']),
            'rows' => count($sheet['rows']),
            'fields' => array_map(static fn (array $f): bool => $f['required'], ImportFields::for($kind)),
        ];
    }

    /**
     * Checks every row, then — unless this is a dry run and only if nothing
     * failed — writes them all.
     *
     * @param  array<string, int|null>  $mapping  field => column index
     * @return array{written: bool, records: int, lines: int, errors: list<array{row: int, field: string|null, key: string, value: string|null}>, error_count: int}
     */
    public function run(string $path, string $extension, string $kind, array $mapping, bool $dryRun): array
    {
        $this->resetErrors();

        $sheet = $this->reader->read($path, $extension);
        $mapping = $this->checkedMapping($kind, $mapping, count($sheet['headers']));

        $records = $kind === 'products'
            ? $this->products($sheet['rows'], $mapping)
            : $this->orders($sheet['rows'], $mapping);

        $lines = $kind === 'products' ? count($records) : array_sum(array_map(
            static fn (ImportedOrder $o): int => count($o->lines ?? []),
            $records,
        ));

        $result = [
            'written' => false,
            'records' => count($records),
            'lines' => $lines,
            'errors' => $this->errors,
            'error_count' => $this->errorCount,
        ];

        if ($dryRun || $result['error_count'] > 0 || $records === []) {
            return $result;
        }

        DB::transaction(function () use ($records, $kind): void {
            foreach ($records as $record) {
                $kind === 'products' ? ($this->products)($record) : ($this->orders)($record);
            }

            $this->recorder->record(
                action: 'import.file',
                context: ['kind' => $kind, 'records' => count($records)],
            );
        });

        return ['written' => true] + $result;
    }

    /**
     * Every required field mapped, every index a real column, no column
     * used for two fields.
     *
     * @param  array<string, int|null>  $mapping
     * @return array<string, int|null>
     */
    private function checkedMapping(string $kind, array $mapping, int $width): array
    {
        $out = [];
        $used = [];

        foreach (ImportFields::for($kind) as $field => $definition) {
            $index = $mapping[$field] ?? null;
            $index = $index === null ? null : (int) $index;

            if ($index !== null && ($index < 0 || $index >= $width)) {
                throw new ImportProblem('mapping_out_of_range', ['field' => $field]);
            }

            if ($index !== null && in_array($index, $used, true)) {
                throw new ImportProblem('mapping_duplicate', ['field' => $field]);
            }

            if ($index === null && $definition['required']) {
                throw new ImportProblem('mapping_missing', ['field' => $field]);
            }

            if ($index !== null) {
                $used[] = $index;
            }

            $out[$field] = $index;
        }

        return $out;
    }

    /**
     * @param  list<list<string>>  $rows
     * @param  array<string, int|null>  $map
     * @return list<ImportedProduct>
     */
    private function products(array $rows, array $map): array
    {
        $records = [];
        $seen = [];

        foreach ($rows as $i => $row) {
            $line = $i + 2;
            $sku = mb_substr($this->cell($row, $map, 'sku'), 0, 64);
            $name = $this->cell($row, $map, 'name');

            if ($sku === '') {
                $this->fail($line, 'sku', 'required', null);

                continue;
            }

            if (isset($seen[$sku])) {
                // The same SKU twice would write one product twice, and the
                // second row would silently win.
                $this->fail($line, 'sku', 'duplicate', $sku);

                continue;
            }

            $seen[$sku] = true;

            if ($name === '') {
                $this->fail($line, 'name', 'required', null);

                continue;
            }

            /*
             * Required: RecordImportedProduct writes the price, so a blank one
             * read as zero would reprice an existing product to nothing.
             */
            $price = $this->amount($row, $map, 'price', $line, required: true);
            $cost = $this->amount($row, $map, 'cost', $line, required: false);

            if ($price === false || $cost === false) {
                continue;
            }

            $records[] = new ImportedProduct(
                source: self::SOURCE,
                externalId: null,
                sku: $sku,
                name: $name,
                price: Money::round((string) $price, 4),
                // A blank cost leaves one already entered here alone; zero
                // is read the same way, as "not filled in".
                cost: $cost !== null && bccomp($cost, '0', 4) > 0 ? Money::round($cost, 4) : null,
                isActive: true,
            );
        }

        return $records;
    }

    /**
     * One row per line; rows sharing an order number are one order.
     *
     * @param  list<list<string>>  $rows
     * @param  array<string, int|null>  $map
     * @return list<ImportedOrder>
     */
    private function orders(array $rows, array $map): array
    {
        /** @var array<string, list<array{line: int, row: list<string>}>> $groups */
        $groups = [];

        foreach ($rows as $i => $row) {
            $id = mb_substr($this->cell($row, $map, 'order_id'), 0, 190);

            if ($id === '') {
                $this->fail($i + 2, 'order_id', 'required', null);

                continue;
            }

            $groups[$id][] = ['line' => $i + 2, 'row' => $row];
        }

        $settings = BusinessSetting::current();
        $timezone = $settings->timezone ?: 'Asia/Riyadh';
        $country = self::COUNTRY_BY_CURRENCY[$settings->currency] ?? null;

        $records = [];

        foreach ($groups as $id => $group) {
            $order = $this->order((string) $id, $group, $map, $timezone, $country);

            if ($order !== null) {
                $records[] = $order;
            }
        }

        return $records;
    }

    /**
     * @param  list<array{line: int, row: list<string>}>  $group
     * @param  array<string, int|null>  $map
     */
    private function order(string $id, array $group, array $map, string $timezone, ?string $country): ?ImportedOrder
    {
        // Order-level columns come from the order's first row.
        ['line' => $first, 'row' => $head] = $group[0];
        $ok = true;

        $rawDate = $this->cell($head, $map, 'date');
        $placedAt = CellValue::date($rawDate, $timezone);

        if ($placedAt === null) {
            $this->fail($first, 'date', $rawDate === '' ? 'required' : 'date', $rawDate ?: null);
            $ok = false;
        }

        $rawStatus = $this->cell($head, $map, 'status');
        $status = CellValue::status($rawStatus);

        if ($status === null) {
            $this->fail($first, 'status', 'status', $rawStatus);
            $ok = false;
        }

        $shipping = $this->amount($head, $map, 'shipping', $first, required: false);
        $tax = $this->amount($head, $map, 'tax', $first, required: false);
        $discount = $this->amount($head, $map, 'discount', $first, required: false);
        $total = $this->amount($head, $map, 'order_total', $first, required: false);

        if (in_array(false, [$shipping, $tax, $discount, $total], true)) {
            $ok = false;
        }

        $lines = [];
        $subtotal = '0';

        foreach ($group as ['line' => $line, 'row' => $row]) {
            $parsed = $this->line($row, $map, $line);

            if ($parsed === false) {
                $ok = false;
            } elseif ($parsed !== null) {
                $lines[] = $parsed;
                $subtotal = bcadd($subtotal, $parsed->lineTotal, 4);
            }
        }

        if (! $ok || $status === null) {
            return null;
        }

        $discount = ltrim((string) ($discount ?? '0'), '-');
        $total ??= bcsub(bcadd(bcadd($subtotal, (string) ($shipping ?? '0'), 4), (string) ($tax ?? '0'), 4), $discount, 4);

        return new ImportedOrder(
            source: self::SOURCE,
            externalId: $id,
            status: $status,
            placedAt: Carbon::instance($placedAt),
            customer: $this->customer($head, $map, $country),
            lines: $lines,
            subtotal: $subtotal,
            discount: $discount,
            tax: (string) ($tax ?? '0'),
            shipping: (string) ($shipping ?? '0'),
            total: (string) $total,
            payments: $this->payments($head, $map, $status, (string) $total),
            cancellationReason: 'Cancelled in the imported file',
            context: ['file_row' => $first],
        );
    }

    /**
     * One line, null for a row that describes no product (an order-level row
     * in a file that keeps them separate), false when it cannot be read.
     *
     * @param  list<string>  $row
     * @param  array<string, int|null>  $map
     */
    private function line(array $row, array $map, int $line): ImportedLine|false|null
    {
        $sku = mb_substr($this->cell($row, $map, 'sku'), 0, 64);
        $name = $this->cell($row, $map, 'product_name');

        if ($sku === '' && $name === '') {
            return null;
        }

        $rawQuantity = $this->cell($row, $map, 'quantity');
        $quantityValue = $rawQuantity === '' ? '1' : CellValue::number($rawQuantity);

        if ($quantityValue === null || bccomp($quantityValue, '0', 4) <= 0 || bccomp($quantityValue, (string) (int) $quantityValue, 4) !== 0) {
            // Whole units only: half a product sold is a typo, not a sale.
            $this->fail($line, 'quantity', 'quantity', $rawQuantity);

            return false;
        }

        $quantity = (int) $quantityValue;
        $unit = $this->amount($row, $map, 'unit_price', $line, required: false);
        $lineTotal = $this->amount($row, $map, 'line_total', $line, required: false);

        if ($unit === false || $lineTotal === false) {
            return false;
        }

        if ($unit === null && $lineTotal === null) {
            $this->fail($line, 'unit_price', 'price_missing', null);

            return false;
        }

        $lineTotal ??= bcmul((string) $unit, (string) $quantity, 4);

        return new ImportedLine(
            productExternalId: null,
            productSku: $sku !== '' ? $sku : null,
            productName: $name !== '' ? $name : $sku,
            productPrice: Money::round($unit ?? bcdiv($lineTotal, (string) $quantity, 4), 4),
            name: $name !== '' ? $name : null,
            sku: $sku !== '' ? $sku : null,
            fallbackName: 'Imported item',
            quantity: $quantity,
            lineTotal: $lineTotal,
            discount: '0',
        );
    }

    /**
     * The person, identified by phone, then email, then name. None of the
     * three is a walk-in, as an empty customer is on the order screen.
     *
     * @param  list<string>  $row
     * @param  array<string, int|null>  $map
     */
    private function customer(array $row, array $map, ?string $country): ?ImportedCustomer
    {
        $name = $this->cell($row, $map, 'customer_name');
        $email = mb_strtolower($this->cell($row, $map, 'customer_email'));
        $rawPhone = $this->cell($row, $map, 'customer_phone');
        $phone = $rawPhone !== '' ? PhoneNumber::normalize($rawPhone, $country) : null;
        $email = filter_var($email, FILTER_VALIDATE_EMAIL) !== false ? $email : null;

        $identity = match (true) {
            $phone !== null => 'phone:'.$phone,
            $email !== null => 'email:'.$email,
            $name !== '' => 'name:'.ImportFields::normalise($name),
            default => null,
        };

        if ($identity === null) {
            return null;
        }

        return new ImportedCustomer(
            externalId: mb_substr($identity, 0, 190),
            name: $name !== '' ? mb_substr($name, 0, 180) : ($phone ?? (string) $email),
            email: $email,
            phone: $phone,
        );
    }

    /**
     * Whether the money is in.
     *
     * A file of past sales rarely says, so: a completed sale is paid, and so
     * is any committed order whose method is not cash on delivery. A
     * cash-on-delivery order still on its way is owed, which is what the
     * receivables figure exists to show (ADR-022).
     *
     * @param  list<string>  $row
     * @param  array<string, int|null>  $map
     * @return list<ImportedPayment>
     */
    private function payments(array $row, array $map, OrderStatus $status, string $total): array
    {
        $raw = $this->cell($row, $map, 'payment_method');
        $method = CellValue::paymentMethod($raw);

        $paid = $status === OrderStatus::Fulfilled
            || ($status === OrderStatus::Confirmed && $raw !== '' && $method !== PaymentMethod::CashOnDelivery);

        if (! $paid) {
            return [];
        }

        return [new ImportedPayment(amount: $total, method: $method, reference: $raw !== '' ? $raw : null)];
    }

    /**
     * A money cell: null when blank, false (and an error) when unreadable.
     *
     * @param  list<string>  $row
     * @param  array<string, int|null>  $map
     */
    private function amount(array $row, array $map, string $field, int $line, bool $required): string|false|null
    {
        $raw = $this->cell($row, $map, $field);

        if ($raw === '') {
            if ($required) {
                $this->fail($line, $field, 'required', null);

                return false;
            }

            return null;
        }

        $value = CellValue::number($raw);

        if ($value === null) {
            $this->fail($line, $field, 'number', $raw);

            return false;
        }

        return $value;
    }

    /**
     * @param  list<string>  $row
     * @param  array<string, int|null>  $map
     */
    private function cell(array $row, array $map, string $field): string
    {
        $index = $map[$field] ?? null;

        return $index === null ? '' : trim((string) ($row[$index] ?? ''));
    }

    private function resetErrors(): void
    {
        $this->errors = [];
        $this->errorCount = 0;
    }

    private function fail(int $row, ?string $field, string $key, ?string $value): void
    {
        $this->errorCount++;

        if (count($this->errors) < self::MAX_ERRORS) {
            $this->errors[] = ['row' => $row, 'field' => $field, 'key' => $key, 'value' => $value !== null ? mb_substr($value, 0, 80) : null];
        }
    }
}
