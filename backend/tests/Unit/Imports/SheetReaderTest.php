<?php

declare(strict_types=1);

use App\Domain\Imports\ImportProblem;
use App\Domain\Imports\SheetReader;

/*
|--------------------------------------------------------------------------
| Reading a merchant's file (ADR-039)
|--------------------------------------------------------------------------
|
| Each case here is a way real files arrive: Excel's byte-order mark, its
| semicolons in comma-decimal locales, its Windows-1256 "CSV" on an Arabic
| machine, and an .xlsx whose first sheet is not called sheet1.
|
*/

function sheetFile(string $content, string $extension = 'csv'): string
{
    $path = tempnam(sys_get_temp_dir(), 'sheet').'.'.$extension;
    file_put_contents($path, $content);

    return $path;
}

/**
 * A real .xlsx, built the way Excel lays one out: shared strings for text,
 * numbers inline, and a workbook that names which part is the first sheet.
 *
 * @param  list<list<string|int|float>>  $rows
 */
function xlsxFile(array $rows, string $sheetPart = 'worksheets/sheet1.xml'): string
{
    $shared = [];
    $xmlRows = '';

    foreach ($rows as $r => $row) {
        $cells = '';

        foreach ($row as $c => $value) {
            if ($value === '') {
                continue; // Excel omits empty cells entirely.
            }

            $ref = chr(65 + $c).($r + 1);

            if (is_string($value)) {
                $index = array_search($value, $shared, true);

                if ($index === false) {
                    $shared[] = $value;
                    $index = count($shared) - 1;
                }

                $cells .= "<c r=\"{$ref}\" t=\"s\"><v>{$index}</v></c>";
            } else {
                $cells .= "<c r=\"{$ref}\"><v>{$value}</v></c>";
            }
        }

        $xmlRows .= '<row r="'.($r + 1).'">'.$cells.'</row>';
    }

    $strings = implode('', array_map(fn (string $s): string => '<si><t>'.htmlspecialchars($s, ENT_XML1).'</t></si>', $shared));

    $path = tempnam(sys_get_temp_dir(), 'xlsx').'.xlsx';
    $zip = new ZipArchive;
    $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    $zip->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Orders" sheetId="3" r:id="rId7"/></sheets></workbook>');
    $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="worksheet" Target="'.$sheetPart.'"/></Relationships>');
    $zip->addFromString('xl/'.$sheetPart, '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'.$xmlRows.'</sheetData></worksheet>');
    $zip->addFromString('xl/sharedStrings.xml', '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'.$strings.'</sst>');
    $zip->close();

    return $path;
}

it('reads a plain CSV into headers and rows', function (): void {
    $sheet = (new SheetReader)->read(sheetFile("order,total\nA1,100\nA2,50\n"), 'csv');

    expect($sheet['headers'])->toBe(['order', 'total'])
        ->and($sheet['rows'])->toBe([['A1', '100'], ['A2', '50']]);
});

it('drops Excel\'s byte-order mark, so the first header still matches', function (): void {
    $sheet = (new SheetReader)->read(sheetFile("\xEF\xBB\xBForder,total\nA1,100\n"), 'csv');

    expect($sheet['headers'][0])->toBe('order');
});

it('reads a semicolon file, as Excel saves one in comma-decimal locales', function (): void {
    $sheet = (new SheetReader)->read(sheetFile("order;total\nA1;12,50\n"), 'csv');

    expect($sheet['rows'])->toBe([['A1', '12,50']]);
});

it('reads Arabic saved by Excel in Windows-1256, not as noise', function (): void {
    $content = (string) iconv('UTF-8', 'WINDOWS-1256', "العميل,الإجمالي\nسارة,100\n");

    $sheet = (new SheetReader)->read(sheetFile($content), 'csv');

    expect($sheet['headers'])->toBe(['العميل', 'الإجمالي'])
        ->and($sheet['rows'][0][0])->toBe('سارة');
});

it('keeps a quoted comma inside one cell', function (): void {
    $sheet = (new SheetReader)->read(sheetFile("name,city\n\"Lamp, brass\",Jeddah\n"), 'csv');

    expect($sheet['rows'][0])->toBe(['Lamp, brass', 'Jeddah']);
});

it('pads a short row and skips blank ones', function (): void {
    $sheet = (new SheetReader)->read(sheetFile("a,b,c\n1\n,,\n2,3,4\n"), 'csv');

    expect($sheet['rows'])->toBe([['1', '', ''], ['2', '3', '4']]);
});

it('refuses an empty file', function (): void {
    expect(fn () => (new SheetReader)->read(sheetFile(''), 'csv'))->toThrow(ImportProblem::class);
});

it('reads an Excel workbook, text and numbers', function (): void {
    $sheet = (new SheetReader)->read(xlsxFile([
        ['رقم الطلب', 'Total'],
        ['A1', 115.5],
    ]), 'xlsx');

    expect($sheet['headers'])->toBe(['رقم الطلب', 'Total'])
        ->and($sheet['rows'])->toBe([['A1', '115.5']]);
});

it('keeps each value in its own column when Excel left a cell out', function (): void {
    /*
     * Excel writes no element for an empty cell, so counting cells would
     * slide every later value one column left. The cell's own reference says
     * where it belongs.
     */
    $sheet = (new SheetReader)->read(xlsxFile([
        ['a', 'b', 'c'],
        ['1', '', '3'],
    ]), 'xlsx');

    expect($sheet['rows'][0])->toBe(['1', '', '3']);
});

it('finds the first sheet when it is not called sheet1', function (): void {
    $sheet = (new SheetReader)->read(xlsxFile([['x'], ['y']], 'worksheets/sheet4.xml'), 'xlsx');

    expect($sheet['rows'])->toBe([['y']]);
});

it('refuses a file that only claims to be a workbook', function (): void {
    expect(fn () => (new SheetReader)->read(sheetFile('not a zip', 'xlsx'), 'xlsx'))->toThrow(ImportProblem::class);
});
