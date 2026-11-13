<?php

declare(strict_types=1);

namespace App\Domain\Imports;

use XMLReader;
use ZipArchive;

/**
 * The rows of a CSV or Excel file, as strings (ADR-039).
 *
 * NO SPREADSHEET LIBRARY, on purpose. The backend depends on four packages
 * and this would have been the fifth for one screen. An `.xlsx` file is a
 * zip of XML, and PHP ships both readers: the parts needed here — the shared
 * string table and the first worksheet's cell values — are a page of code.
 * Formulas arrive as their last calculated value, which is what Excel saved.
 *
 * CSV is where merchants' files actually go wrong, so three things are
 * handled rather than assumed:
 *
 * - THE ENCODING. Excel on an Arabic Windows saves "CSV" in Windows-1256,
 *   not UTF-8. Read as UTF-8 every Arabic name becomes noise, so a file that
 *   is not valid UTF-8 is converted from 1256.
 * - THE DELIMITER. Excel in locales that write decimals with a comma saves
 *   semicolon-separated files. The first line decides.
 * - A BYTE-ORDER MARK, which Excel writes and which would otherwise become
 *   part of the first header's name, so "order_id" never matched.
 */
final class SheetReader
{
    /** Enough for years of a small business's orders; more is a different job. */
    public const MAX_ROWS = 20_000;

    /**
     * The most one part of a workbook may unpack to. A 10 MB upload can hold
     * gigabytes of repeated XML, and reading a part reads all of it into
     * memory: the compressed size says nothing, the stated size says it all.
     */
    public const MAX_PART_BYTES = 20 * 1024 * 1024;

    /**
     * The most cells, and the most characters, one file may hold in all
     * (security audit, 2026-11-13). The row and column limits alone still
     * allowed 20,000 x 256 cells of long text, every one held in an array
     * and copied again on the way out: enough to run a request out of
     * memory. A real import is a few hundred thousand short cells.
     */
    public const MAX_CELLS = 1_000_000;

    public const MAX_CHARACTERS = 20_000_000;

    /**
     * The widest row read. A cell reference is the file's own claim, and
     * "XFD1" would otherwise pad every row to 16,384 cells; no import this
     * screen maps has more than a few dozen columns.
     */
    public const MAX_COLUMNS = 256;

    /**
     * @return array{headers: list<string>, rows: list<list<string>>}
     */
    public function read(string $path, string $extension): array
    {
        $rows = match (strtolower($extension)) {
            'xlsx' => $this->xlsx($path),
            default => $this->csv($path),
        };

        // Rows with nothing in them are spacing, not records.
        $rows = array_values(array_filter(
            $rows,
            static fn (array $row): bool => implode('', array_map('trim', $row)) !== '',
        ));

        if ($rows === []) {
            throw new ImportProblem('empty');
        }

        $headers = array_map(static fn (string $h): string => trim($h), array_shift($rows));

        if (count($rows) > self::MAX_ROWS) {
            throw new ImportProblem('too_many_rows', ['max' => self::MAX_ROWS]);
        }

        // Every row as wide as the header, so a short row reads as blanks.
        $width = count($headers);
        $rows = array_map(
            static fn (array $row): array => array_slice(array_pad(array_map('strval', $row), $width, ''), 0, $width),
            $rows,
        );

        return ['headers' => $headers, 'rows' => $rows];
    }

    /** @return list<list<string>> */
    private function csv(string $path): array
    {
        $content = (string) file_get_contents($path);

        if (str_starts_with($content, "\xEF\xBB\xBF")) {
            $content = substr($content, 3);
        }

        if (! mb_check_encoding($content, 'UTF-8')) {
            $converted = @iconv('WINDOWS-1256', 'UTF-8//IGNORE', $content);
            $content = $converted === false ? '' : $converted;
        }

        $firstLine = strtok($content, "\r\n") ?: '';
        $delimiter = $this->delimiter($firstLine);

        $stream = fopen('php://temp', 'r+');

        if ($stream === false) {
            throw new ImportProblem('unreadable');
        }

        fwrite($stream, $content);
        rewind($stream);

        $rows = [];
        $budget = new SheetBudget(self::MAX_CELLS, self::MAX_CHARACTERS);

        while (($row = fgetcsv($stream, null, $delimiter, '"', '')) !== false) {
            $cells = array_map(static fn ($cell): string => (string) $cell, $row);
            $budget->spend(count($cells), array_sum(array_map('mb_strlen', $cells)));
            $rows[] = $cells;

            if (count($rows) > self::MAX_ROWS + 1) {
                break;
            }
        }

        fclose($stream);

        return $rows;
    }

    private function delimiter(string $line): string
    {
        $counts = [',' => substr_count($line, ','), ';' => substr_count($line, ';'), "\t" => substr_count($line, "\t")];
        arsort($counts);

        return (string) array_key_first($counts);
    }

    /**
     * One part of the workbook, refused before it is unpacked if it would be
     * larger than MAX_PART_BYTES. False when the part is absent, as
     * getFromName() answers.
     */
    private function part(ZipArchive $zip, string $name): string|false
    {
        $stat = $zip->statName($name);

        if ($stat === false) {
            return false;
        }

        if ($stat['size'] > self::MAX_PART_BYTES) {
            throw new ImportProblem('too_large');
        }

        return $zip->getFromName($name);
    }

    /** @return list<list<string>> */
    private function xlsx(string $path): array
    {
        $zip = new ZipArchive;

        if ($zip->open($path) !== true) {
            throw new ImportProblem('unreadable');
        }

        $shared = $this->sharedStrings($zip);
        $sheet = $this->part($zip, $this->firstSheetPath($zip));
        $zip->close();

        if ($sheet === false) {
            throw new ImportProblem('unreadable');
        }

        $reader = new XMLReader;
        $reader->XML($sheet, null, LIBXML_NONET);

        $rows = [];
        $row = null;
        $column = 0;
        $type = null;
        $budget = new SheetBudget(self::MAX_CELLS, self::MAX_CHARACTERS);

        while ($reader->read()) {
            if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'row') {
                $row = [];
            } elseif ($reader->nodeType === XMLReader::END_ELEMENT && $reader->localName === 'row') {
                $rows[] = $row ?? [];
                $row = null;

                if (count($rows) > self::MAX_ROWS + 1) {
                    break;
                }
            } elseif ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'c' && $row !== null) {
                // The cell's own reference, "C7", says which column it is —
                // Excel omits empty cells, so counting would shift the rest.
                $column = $this->columnIndex((string) $reader->getAttribute('r'));
                $type = $reader->getAttribute('t');

                if ($reader->isEmptyElement) {
                    continue;
                }

                if ($column >= self::MAX_COLUMNS) {
                    continue;
                }

                $value = $this->cellValue($reader, $type, $shared);
                // Padding counts too: a sparse row of distant cells is still that wide.
                $budget->spend(max(1, $column + 1 - count($row)), mb_strlen($value));
                $row = array_pad($row, $column, '');
                $row[$column] = $value;
            }
        }

        return array_map(static fn (array $r): array => array_values($r), $rows);
    }

    /**
     * @param  list<string>  $shared
     */
    private function cellValue(XMLReader $reader, ?string $type, array $shared): string
    {
        $depth = $reader->depth;
        $text = '';

        while ($reader->read() && $reader->depth > $depth) {
            if ($reader->nodeType === XMLReader::TEXT || $reader->nodeType === XMLReader::CDATA) {
                $text .= $reader->value;
            }
        }

        return match ($type) {
            's' => $shared[(int) $text] ?? '',
            'b' => $text === '1' ? 'TRUE' : 'FALSE',
            default => $text,
        };
    }

    /**
     * The worksheet Excel shows first.
     *
     * Not always `sheet1.xml`: a workbook whose first sheet was deleted, or
     * one written by another program, numbers them differently. The order is
     * in workbook.xml, and its relationship file says which part each is.
     */
    private function firstSheetPath(ZipArchive $zip): string
    {
        $fallback = 'xl/worksheets/sheet1.xml';
        $workbook = $this->part($zip, 'xl/workbook.xml');
        $rels = $this->part($zip, 'xl/_rels/workbook.xml.rels');

        if ($workbook === false || $rels === false) {
            return $fallback;
        }

        if (! preg_match('/<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/', $workbook, $sheet)) {
            return $fallback;
        }

        $id = preg_quote($sheet[1], '/');

        if (! preg_match('/<Relationship\b(?=[^>]*\bId="'.$id.'")[^>]*\bTarget="([^"]+)"/', $rels, $target)) {
            return $fallback;
        }

        $path = ltrim($target[1], '/');

        return str_starts_with($path, 'xl/') ? $path : 'xl/'.$path;
    }

    /** @return list<string> */
    private function sharedStrings(ZipArchive $zip): array
    {
        $xml = $this->part($zip, 'xl/sharedStrings.xml');

        if ($xml === false) {
            return [];
        }

        $reader = new XMLReader;
        $reader->XML($xml, null, LIBXML_NONET);

        $strings = [];
        $current = null;

        while ($reader->read()) {
            if ($reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'si') {
                $current = '';
            } elseif ($reader->nodeType === XMLReader::END_ELEMENT && $reader->localName === 'si') {
                $strings[] = (string) $current;
                $current = null;
            } elseif ($current !== null && $reader->nodeType === XMLReader::ELEMENT && $reader->localName === 'rPh') {
                // Phonetic guides (Japanese ruby text) are not part of the value.
                $reader->next();
            } elseif ($current !== null && ($reader->nodeType === XMLReader::TEXT || $reader->nodeType === XMLReader::SIGNIFICANT_WHITESPACE)) {
                $current .= $reader->value;
            }
        }

        return $strings;
    }

    /** "A" → 0, "Z" → 25, "AA7" → 26. */
    private function columnIndex(string $reference): int
    {
        $letters = preg_replace('/[^A-Z]/', '', strtoupper($reference)) ?? '';

        // Excel's last column is XFD, three letters. More is not a column,
        // and twelve letters would overflow the arithmetic into a float.
        if (strlen($letters) > 3) {
            return self::MAX_COLUMNS;
        }

        $index = 0;

        foreach (str_split($letters) as $letter) {
            $index = $index * 26 + (ord($letter) - 64);
        }

        return max(0, $index - 1);
    }
}
