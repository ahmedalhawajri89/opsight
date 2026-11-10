<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Imports\FileImport;
use App\Domain\Imports\ImportFields;
use App\Domain\Imports\ImportProblem;
use App\Http\Controllers\Controller;
use App\Models\Integration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;

/**
 * Importing orders or products from a file (ADR-039).
 *
 * Stateless, in two requests that both carry the file: one to read its
 * columns and suggest a mapping, one to check — and, if asked and clean,
 * write — every row. Nothing is kept on the server between them, so there is
 * no half-uploaded file to clean up and no stored spreadsheet of customers'
 * phone numbers waiting to leak.
 *
 * Gated like connecting a store, because it is the same act: bringing a
 * body of records into the business from outside it.
 */
class FileImportController extends Controller
{
    /** 10 MB is years of a small business's orders as CSV. */
    private const MAX_KB = 10240;

    public function preview(Request $request, FileImport $import): JsonResponse
    {
        $this->authorize('create', Integration::class);

        $input = $request->validate($this->fileRules());
        $file = $input['file'];
        assert($file instanceof UploadedFile);

        try {
            $preview = $import->preview((string) $file->getRealPath(), $this->extension($file), $input['kind']);
        } catch (ImportProblem $problem) {
            return $this->problem($problem);
        }

        return response()->json(['data' => $preview]);
    }

    public function store(Request $request, FileImport $import): JsonResponse
    {
        $this->authorize('create', Integration::class);

        $input = $request->validate($this->fileRules() + [
            'mapping' => ['required', 'array'],
            'mapping.*' => ['nullable', 'integer', 'min:0'],
            'dry_run' => ['sometimes', 'boolean'],
        ]);

        $file = $input['file'];
        assert($file instanceof UploadedFile);

        // A year of orders is thousands of writes in one transaction.
        set_time_limit(300);

        try {
            $result = $import->run(
                (string) $file->getRealPath(),
                $this->extension($file),
                $input['kind'],
                $input['mapping'],
                (bool) ($input['dry_run'] ?? false),
            );
        } catch (ImportProblem $problem) {
            return $this->problem($problem);
        }

        $result['errors'] = array_map(fn (array $error): array => $error + [
            'message' => __("imports.errors.{$error['key']}", [
                'field' => $error['field'] !== null ? __("imports.fields.{$error['field']}") : '',
                'value' => $error['value'] ?? '',
            ]),
        ], $result['errors']);

        return response()->json(['data' => $result], $result['written'] ? 201 : 200);
    }

    /** @return array<string, array<int, mixed>> */
    private function fileRules(): array
    {
        return [
            // By extension as well as by content: a CSV is sniffed as text/plain.
            'file' => ['required', 'file', 'max:'.self::MAX_KB, 'extensions:csv,txt,xlsx'],
            'kind' => ['required', 'string', Rule::in(ImportFields::KINDS)],
        ];
    }

    private function extension(UploadedFile $file): string
    {
        return strtolower($file->getClientOriginalExtension()) === 'xlsx' ? 'xlsx' : 'csv';
    }

    private function problem(ImportProblem $problem): JsonResponse
    {
        $replace = $problem->replace;

        if (isset($replace['field'])) {
            $replace['field'] = __('imports.fields.'.$replace['field']);
        }

        return response()->json([
            'message' => __("imports.problems.{$problem->key}", $replace),
            'code' => 'import.'.$problem->key,
        ], 422);
    }
}
