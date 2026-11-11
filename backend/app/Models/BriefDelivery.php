<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Model;

/**
 * One day's morning brief for one person: sent, or why not.
 *
 * @property int $user_id
 * @property string $brief_date
 * @property string $channel
 * @property string $status
 * @property string|null $error
 */
class BriefDelivery extends Model
{
    use ScopedToBusiness;

    public const SENT = 'sent';

    public const FAILED = 'failed';

    /** @var list<string> */
    protected $fillable = ['user_id', 'brief_date', 'channel', 'status', 'error'];
}
