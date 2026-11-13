<?php

declare(strict_types=1);

namespace App\Domain\Imports;

/**
 * How much of a file has been read, against how much one file may hold
 * (SheetReader::MAX_CELLS, MAX_CHARACTERS). Refuses as soon as either is
 * passed, so a hostile file is stopped part-way rather than read whole.
 */
final class SheetBudget
{
    private int $cells = 0;

    private int $characters = 0;

    public function __construct(private readonly int $maxCells, private readonly int $maxCharacters) {}

    public function spend(int $cells, int $characters): void
    {
        $this->cells += $cells;
        $this->characters += $characters;

        if ($this->cells > $this->maxCells || $this->characters > $this->maxCharacters) {
            throw new ImportProblem('too_large');
        }
    }
}
