<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Category;
use App\Support\Localization\LocalizedName;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Category
 */
class CategoryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'name_ar' => $this->name_ar,
            'display_name' => LocalizedName::pick($this->name, $this->name_ar),
            'slug' => $this->slug,
            'description' => $this->description,
            'products_count' => $this->whenCounted('products'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
