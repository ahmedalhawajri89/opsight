<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Model;

/**
 * One turn of an Ask Baydar conversation, as the API exchanged it
 * (ADR-038). See the migration for why `content` and `display` differ.
 *
 * @property int $id
 * @property int $conversation_id
 * @property string $role
 * @property list<array<string, mixed>> $content
 * @property string|null $display
 * @property list<array<string, mixed>>|null $sources
 * @property int $input_tokens
 * @property int $output_tokens
 * @property int $cache_read_tokens
 * @property int $cache_write_tokens
 */
class AssistantMessage extends Model
{
    use ScopedToBusiness;

    /** @var list<string> */
    protected $fillable = [
        'conversation_id', 'role', 'content', 'display', 'sources',
        'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['content' => 'array', 'sources' => 'array'];
    }
}
