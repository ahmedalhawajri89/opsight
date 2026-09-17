<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Export limits
|--------------------------------------------------------------------------
|
| SECURITY.md §9.3. Configuration rather than a constant for the same reason
| the insight thresholds are: this is a judgement about how much data should
| be allowed to leave the building in one request, and the person revising it
| should not have to edit a class to do so.
|
| It also makes the REFUSAL testable. Asserting that the cap is enforced by
| creating fifty thousand rows would make the suite unusable; lowering the cap
| to two and asserting the 422 tests the same code path in milliseconds.
|
*/

return [

    /*
     * Rows above which an export is REFUSED, not truncated.
     *
     * A truncated export is indistinguishable from a complete one once it is a
     * file on someone's desktop, and the person who opens it will total a
     * column and act on the answer. Refusing is louder, and the user can
     * narrow the filter.
     */
    'max_rows' => 50_000,

    /*
     * Rows per database round trip while streaming. Small enough that memory
     * stays flat on a large table, large enough to keep the query count sane.
     */
    'chunk' => 500,
];
