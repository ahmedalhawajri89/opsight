<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| English and Arabic dictionaries stay in step
|--------------------------------------------------------------------------
|
| A key present in English and missing in Arabic does not fail loudly at
| runtime: Laravel falls back to printing the KEY, so an Arabic reader sees
| "insights.revenue_drop.message" in the middle of their dashboard. And a
| placeholder dropped from a translation silently deletes a figure from the
| sentence. Both are caught here instead of by a user.
|
*/

/*
 * A plain path, not lang_path(): Pest resolves the datasets below before the
 * application boots, when the helper has no container to ask.
 */
function langDir(): string
{
    return dirname(__DIR__, 3).'/lang';
}

function langFiles(string $locale): array
{
    $files = glob(langDir().'/'.$locale.'/*.php') ?: [];

    return array_map(static fn (string $path): string => basename($path, '.php'), $files);
}

/**
 * @param  array<string, mixed>  $tree
 * @return array<string, string>
 */
function flattenLang(array $tree, string $prefix = ''): array
{
    $flat = [];

    foreach ($tree as $key => $value) {
        $path = $prefix === '' ? (string) $key : $prefix.'.'.$key;

        if (is_array($value)) {
            $flat += flattenLang($value, $path);
        } else {
            $flat[$path] = (string) $value;
        }
    }

    return $flat;
}

/** @return list<string> */
function placeholders(string $message): array
{
    preg_match_all('/:([a-z_]+)/', $message, $matches);

    $names = array_values(array_unique($matches[1]));
    sort($names);

    return $names;
}

it('has an Arabic file for every English one', function (): void {
    expect(langFiles('ar'))->toEqualCanonicalizing(langFiles('en'));
});

it('has the same keys in both languages', function (string $file): void {
    $english = flattenLang(require langDir()."/en/{$file}.php");
    $arabic = flattenLang(require langDir()."/ar/{$file}.php");

    expect(array_diff(array_keys($english), array_keys($arabic)))->toBe([], "missing in ar/{$file}.php")
        ->and(array_diff(array_keys($arabic), array_keys($english)))->toBe([], "missing in en/{$file}.php");
})->with(fn (): array => langFiles('en'));

it('keeps every placeholder in the Arabic translation', function (string $file): void {
    $english = flattenLang(require langDir()."/en/{$file}.php");
    $arabic = flattenLang(require langDir()."/ar/{$file}.php");

    foreach ($english as $key => $message) {
        if (! isset($arabic[$key])) {
            continue;
        }

        expect(placeholders($arabic[$key]))->toBe(
            placeholders($message),
            "{$file}.{$key} has different placeholders in Arabic",
        );
    }
})->with(fn (): array => langFiles('en'));
