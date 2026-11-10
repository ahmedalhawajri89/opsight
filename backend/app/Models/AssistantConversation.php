<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One Ask Baydar conversation, belonging to one person (ADR-038).
 *
 * @property int $id
 * @property int $business_id
 * @property int $user_id
 * @property string $title
 */
class AssistantConversation extends Model
{
    use ScopedToBusiness;

    /** @var list<string> */
    protected $fillable = ['user_id', 'title'];

    /** @return HasMany<AssistantMessage, $this> */
    public function messages(): HasMany
    {
        return $this->hasMany(AssistantMessage::class, 'conversation_id')->orderBy('id');
    }
}
