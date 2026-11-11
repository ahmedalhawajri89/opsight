<?php

declare(strict_types=1);

namespace App\Domain\Brief;

use App\Domain\Brief\Channels\BriefChannel;
use App\Domain\Brief\Channels\EmailChannel;
use App\Domain\Brief\Channels\WhatsAppChannel;
use App\Models\BriefDelivery;
use App\Models\BusinessSetting;
use App\Models\User;
use App\Support\Localization\Localizer;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\App;
use Throwable;

/**
 * One person's morning brief, composed in their language and sent on their
 * channel (product track, phase C).
 *
 * ONCE A DAY, ENFORCED BY THE DATABASE. The delivery row is claimed FIRST,
 * on a unique (user, day) index, and only the run that claims it sends. A
 * second scheduler run, a deploy that overlaps the hour, two servers: all of
 * them find the day taken and do nothing. A failure is kept on the row with
 * its reason, so it is not retried into a flood, and support can see why a
 * brief did not arrive.
 *
 * A test send skips the ledger entirely: the owner pressing "send me one
 * now" must not use up tomorrow's real one.
 */
final class SendBrief
{
    public function __construct(
        private readonly MorningBrief $brief,
        private readonly BriefText $text,
        private readonly Localizer $localizer,
        private readonly EmailChannel $email,
        private readonly WhatsAppChannel $whatsapp,
    ) {}

    public function channelFor(User $user): BriefChannel
    {
        return $user->brief_channel === 'whatsapp' ? $this->whatsapp : $this->email;
    }

    /** Whether WhatsApp can be offered at all on this installation. */
    public function whatsappAvailable(): bool
    {
        return $this->whatsapp->available();
    }

    /**
     * The brief as it would be sent now, rendered for the screen's preview.
     *
     * @return array{brief: array<string, mixed>, text: array<string, mixed>}
     */
    public function preview(User $user, ?CarbonImmutable $now = null): array
    {
        return $this->inLocaleOf($user, function () use ($user, $now): array {
            $brief = $this->brief->for($user, $now);

            return ['brief' => $brief, 'text' => $this->text->render($brief)];
        });
    }

    /**
     * The scheduled send. Returns the status recorded, or null when today
     * was already handled.
     */
    public function daily(User $user, ?CarbonImmutable $now = null): ?string
    {
        $timezone = BusinessSetting::current()->timezone ?: 'UTC';
        $day = ($now ?? CarbonImmutable::now())->setTimezone($timezone)->toDateString();
        $channel = $this->channelFor($user);

        try {
            $delivery = BriefDelivery::query()->create([
                'user_id' => $user->id,
                'brief_date' => $day,
                'channel' => $channel->name(),
                'status' => 'sending',
            ]);
        } catch (QueryException) {
            return null; // Another run claimed today first.
        }

        try {
            $this->deliver($user, $channel, $now);
            $delivery->forceFill(['status' => BriefDelivery::SENT])->save();
        } catch (Throwable $e) {
            report($e);
            // Shown back on the settings screen, so only a reason written
            // for the reader is kept; the rest went to the log above.
            $delivery->forceFill(['status' => BriefDelivery::FAILED, 'error' => mb_substr(self::readerMessage($e), 0, 500)])->save();
        }

        return $delivery->status;
    }

    /** What the reader may be told about a failure: ours, or nothing technical. */
    public static function readerMessage(Throwable $e): string
    {
        return $e instanceof BriefProblem ? $e->getMessage() : __('brief.failed');
    }

    /** "Send me one now", from the settings screen. Throws on failure. */
    public function test(User $user): void
    {
        $this->deliver($user, $this->channelFor($user), null);
    }

    private function deliver(User $user, BriefChannel $channel, ?CarbonImmutable $now): void
    {
        if (! $channel->available()) {
            throw new BriefProblem(__('brief.unavailable_whatsapp'));
        }

        $this->inLocaleOf($user, function () use ($user, $channel, $now): void {
            $brief = $this->brief->for($user, $now);
            $channel->send($user, $brief, $this->text->render($brief));
        });
    }

    /**
     * Runs `$work` in the reader's language and digits, then puts back
     * whatever was in force — the scheduler sends to many people in one
     * process, and one owner's Arabic must not leak into the next manager's
     * English.
     *
     * @template T
     *
     * @param  callable(): T  $work
     * @return T
     */
    private function inLocaleOf(User $user, callable $work): mixed
    {
        $locale = App::getLocale();
        $previous = [$this->localizer->locale(), $this->localizer->numerals()];

        App::setLocale($user->locale ?: 'en');
        $this->localizer->use($user->locale ?: 'en', $user->numerals ?: 'latn');

        try {
            return $work();
        } finally {
            App::setLocale($locale);
            $this->localizer->use(...$previous);
        }
    }
}
