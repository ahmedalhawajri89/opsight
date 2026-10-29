<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Business;
use App\Models\Customer;
use App\Models\Integration;
use App\Models\Order;
use App\Models\Product;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Seeing the Salla integration work without a Salla store.
 *
 * A DEVELOPMENT TOOL, and refused outside a local environment.
 *
 * The integration is covered by tests, but a test proves a claim while this
 * answers a different question: what does it actually look like? It posts a
 * genuinely signed delivery at this installation's own webhook endpoint —
 * over HTTP, through the real route, the real signature check, the real
 * queue — so what it exercises is the running application rather than a
 * harness.
 *
 * It is also the honest answer to "can we connect Salla yet?", which until a
 * merchant account exists can only be demonstrated, not asserted.
 *
 * The data it creates is real data in the business it names, so it is NOT
 * pointed at a business whose figures anything asserts on: the browser suite
 * checks that the second business has exactly its seeded twelve orders, and
 * four simulated ones break it. `--undo` removes everything it made.
 */
class SimulateSalla extends Command
{
    protected $signature = 'opsight:salla:simulate
        {business : The business id to deliver to}
        {--order=9001 : The Salla order id to use}
        {--status=completed : Salla status slug, e.g. completed, canceled, payment_pending}
        {--tamper : Sign with the wrong secret, to see the refusal}
        {--undo : Remove everything a previous run created, and stop}';

    protected $description = 'Post a signed Salla webhook at this installation (local only)';

    public const MERCHANT = '1305146709';

    public function handle(): int
    {
        if (! app()->environment('local')) {
            $this->components->error('Refused: this writes invented orders, and only runs locally.');

            return self::FAILURE;
        }

        $businessId = (int) $this->argument('business');

        if (Business::query()->whereKey($businessId)->doesntExist()) {
            $this->components->error("No business {$businessId}.");

            return self::FAILURE;
        }

        if ($this->option('undo')) {
            return $this->undo($businessId);
        }

        $secret = (string) config('integrations.secrets.salla');

        if ($secret === '') {
            $this->components->error('Set SALLA_WEBHOOK_SECRET in .env first; without it the endpoint is a 404.');

            return self::FAILURE;
        }

        $this->connect($businessId);

        $body = (string) json_encode($this->payload(), JSON_UNESCAPED_UNICODE);
        $signature = hash_hmac('sha256', $body, $this->option('tamper') ? 'the-wrong-secret' : $secret);

        $response = Http::withBody($body, 'application/json')
            ->withHeaders(['X-Salla-Signature' => $signature, 'Accept' => 'application/json'])
            ->post(rtrim((string) config('app.url'), '/').'/api/v1/webhooks/salla');

        $this->components->twoColumnDetail(
            'POST /v1/webhooks/salla'.($this->option('tamper') ? ' (forged)' : ''),
            $response->status().' '.$response->body(),
        );

        if ($response->status() === 202) {
            $this->components->info('Accepted. Nothing is imported until a worker runs: php artisan queue:work --stop-when-empty');
        }

        return self::SUCCESS;
    }

    private function connect(int $businessId): void
    {
        CurrentBusiness::get()->run($businessId, function (): void {
            Integration::query()->updateOrCreate(
                ['provider' => 'salla'],
                [
                    'external_account_id' => self::MERCHANT,
                    'status' => Integration::STATUS_CONNECTED,
                    'access_token' => 'a-simulated-token',
                    'token_expires_at' => now()->addWeek(),
                ],
            );
        });
    }

    private function undo(int $businessId): int
    {
        $removed = CurrentBusiness::get()->run($businessId, function (): array {
            $orders = Order::query()->where('source', 'salla')->get();

            foreach ($orders as $order) {
                $order->payments()->delete();
                $order->refunds()->delete();
                $order->items()->delete();
                $order->forceDelete();
            }

            return [
                'orders' => $orders->count(),
                'products' => Product::query()->where('source', 'salla')->forceDelete(),
                'customers' => Customer::query()->where('source', 'salla')->forceDelete(),
                'integrations' => Integration::query()->where('provider', 'salla')->delete(),
            ];
        });

        $removed['receipts'] = WebhookReceipt::query()->where('provider', 'salla')->delete();

        foreach ($removed as $what => $count) {
            $this->components->twoColumnDetail($what, (string) $count);
        }

        return self::SUCCESS;
    }

    /**
     * An order shaped like Salla's documented webhook example.
     *
     * @return array<string, mixed>
     */
    private function payload(): array
    {
        $id = (int) $this->option('order');

        return [
            'event' => 'order.created',
            'merchant' => (int) self::MERCHANT,
            'created_at' => now()->format('D M d Y H:i:s O'),
            'data' => [
                'id' => $id,
                'reference_id' => 41027662,
                'date' => ['date' => now()->format('Y-m-d H:i:s.u'), 'timezone' => 'Asia/Riyadh'],
                'status' => ['slug' => (string) $this->option('status')],
                'payment_method' => 'mada',
                'payment_methods' => [['amount' => 196, 'payment_method' => 'mada']],
                'currency' => 'SAR',
                'amounts' => [
                    'sub_total' => ['amount' => 186, 'currency' => 'SAR'],
                    'shipping_cost' => ['amount' => 15, 'currency' => 'SAR'],
                    'tax' => ['amount' => ['amount' => 0, 'currency' => 'SAR']],
                    'discounts' => [['title' => 'new offer', 'discount' => '5.00']],
                    'total' => ['amount' => 196, 'currency' => 'SAR'],
                ],
                'customer' => [
                    'id' => 225167971,
                    'first_name' => 'Mohammed',
                    'last_name' => 'Ali',
                    // Salla sends the number as an integer, split from its code.
                    'mobile' => 501806978,
                    'mobile_code' => '+966',
                    'email' => 'mohammed.ali@salla-customers.test',
                    'city' => 'جدة',
                    'country_code' => 'SA',
                ],
                'items' => [[
                    'name' => 'بيتزا خضار',
                    'sku' => 'SALLA-PIZZA-1',
                    'quantity' => 2,
                    'amounts' => [
                        'price_without_tax' => ['amount' => 120, 'currency' => 'SAR'],
                        'total_discount' => ['amount' => 5, 'currency' => 'SAR'],
                    ],
                    'product' => ['id' => 720881993, 'sku' => 'SALLA-PIZZA-1', 'name' => 'بيتزا خضار', 'price' => ['amount' => 66, 'currency' => 'SAR']],
                ], [
                    'name' => 'عصير برتقال',
                    'sku' => 'SALLA-JUICE-1',
                    'quantity' => 3,
                    'amounts' => ['price_without_tax' => ['amount' => 66, 'currency' => 'SAR']],
                    'product' => ['id' => 720881994, 'sku' => 'SALLA-JUICE-1', 'name' => 'عصير برتقال', 'price' => ['amount' => 22, 'currency' => 'SAR']],
                ]],
            ],
        ];
    }
}
