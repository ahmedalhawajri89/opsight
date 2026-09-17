# Opsight — Roadmap

Phase 00 document. Phases are sequential; each ends with something demonstrable.

---

## Phase 00 — Architecture & Foundation ✅ *(complete)*

Repository initialised, environment verified, product and architecture defined.

**Delivered:** this documentation set, `.gitignore`, `.editorconfig`, `.gitattributes`,
`README.md`.

**Deliberately not delivered:** any application code, any dependency, any migration, any UI.

---

## Phase 01 — Walking skeleton ✅ *(complete)*

**Goal.** One thin vertical slice through the entire stack, proving the architecture works
before any feature is built on it.

A walking skeleton is chosen over "build the whole backend first" because the riskiest part
of this architecture is the seam — Sanctum's cross-subdomain cookie flow between Next.js and
Laravel. That risk should be retired in week one, not discovered in week six.

**Backend**

- Laravel 12 installed in `backend/`, configured for MySQL/MariaDB.
- `users` and `business_settings` migrations. Nothing else.
- Sanctum configured for SPA mode; CORS and cookie domains set.
- `POST /auth/login`, `POST /auth/logout`, `GET /me`, `GET /health`.
- The ability registry (ADR-003) with all four roles, returned by `/me`.
- Pest configured against a real MySQL test database.
- Pint and PHPStan/Larastan level 6 configured.

**Frontend**

- Next.js in `frontend/`, JavaScript, App Router, Tailwind. **No TypeScript.**
- `lib/apiClient.js` with credentials, CSRF and error normalisation.
- `AuthProvider`, login page, protected `(app)` layout, placeholder dashboard.
- `lib/permissions.js` and `<Can>`.
- TanStack Query configured.
- ESLint, Prettier, Vitest configured.

**Shared**

- `.env.example` for both applications.
- Local setup guide, including the hosts-file entries ADR-002 requires.
- CI pipeline with path filtering.
- One Playwright test: log in, see the dashboard, log out.

**Done when:** all four seeded role users can log in from the browser, `/me` returns the
correct abilities for each, an unauthenticated user is redirected, and CI is green.

**Outcome.** All of the above met. Laravel 12.69.2 + Next.js 16.3.5 (React 19, JavaScript).
49 backend tests (536 assertions), 22 frontend tests, 5 browser E2E tests, Pint clean,
PHPStan level 6 clean on application code. The Sanctum cookie seam was verified end to end
over real HTTP as well as in the suites.

Three defects were found and fixed by building it, which is why the phase exists:

1. The test suite's `array` session driver meant authentication survived on a cached
   in-memory guard rather than on the session — a broken logout would have passed. Switched
   to a persisted driver and added a helper that models a fresh per-request container.
2. `ThrottleRequestsException` was imported from the wrong namespace, so that arm of the
   error contract silently never matched and throttled requests returned a generic code.
3. Signing out cleared the whole query cache, which removed the auth query entry itself;
   the observer never learned the session had ended, so the redirect to `/login` bounced
   straight back to the dashboard.

---

## Phase 02 — Design system & application shell ✅ *(complete)*

**Goal.** Every UI primitive exists and is verified in both themes before feature screens
are built, so no screen invents its own components.

- Tailwind token layer for both themes (UI_UX_DIRECTION.md §11).
- Primitives: Button, Input, Select, Checkbox, Radio, Textarea, DatePicker, Badge,
  Tooltip, Dialog, Dropdown, Tabs, Skeleton, Toast.
- Data components: DataTable, Pagination, FilterBar, SortHeader, EmptyState, ErrorState,
  StatTile, ComparisonValue.
- Layout: Sidebar (ability-filtered), Topbar, PageHeader, PeriodSelector.
- `lib/format.js` and `lib/periods.js`, fully tested.
- `useUrlFilters`.
- The development-only component gallery route.
- The ESLint rule forbidding physical CSS direction properties.

**Done when:** the gallery renders every component in every state in both themes, passes an
automated contrast check, and is fully keyboard operable.

**Outcome.** All met. 151 frontend tests (up from 22), 11 browser E2E tests (up from 5),
ESLint and Prettier clean, build green. The gallery lives at `/gallery` in development only.

The automated contrast check earned its place on the first run, catching three real defects
that a visual review would have missed:

1. **The chart palette was unreadable to colour-blind users.** The CSS comment claimed it had
   been "checked for deuteranopia and protanopia" — it had not. Simulating both and measuring
   perceptual distance gave ΔE 1.8 between two series, meaning they were indistinguishable.
   The palette was redesigned around the blue-amber axis and lightness, and now measures
   ΔE 16.4 (light) and 23.0 (dark).
2. **Input borders were at 1.54:1**, against a WCAG requirement of 3:1 for a control boundary.
3. **The warning badge was at 4.29:1**, just under the 4.5:1 body-text requirement.

A fourth finding was about the test rather than the palette: WCAG contrast ratio is the wrong
measure for whether two *categorical* colours are distinguishable — two hues can share a
luminance and still look completely different. That check was replaced with colour-blindness
simulation plus a CIE Lab ΔE threshold.

**One convention changed.** Files containing JSX now use the `.jsx` extension; plain
JavaScript keeps `.js`. Vite 8's oxc transform decides how to parse a file from its
extension and does not expose an override, so `.js`-with-JSX failed to parse in tests. The
extension is what tells every tool how to read the file, and the split is self-documenting.
**This is still a JavaScript-only project — there is no TypeScript anywhere.**

---

## Phase 03 — Core operational modules ✅ *(complete)*

**Goal.** Source data can be created and read. This is the largest phase.

Sequenced by dependency: Products and Categories → Customers → Inventory → Orders.

- Full schema migrations for all remaining tables.
- Models, policies, FormRequests, API Resources with field redaction.
- Domain services: `ConfirmOrder`, `CancelOrder`, `FulfilOrder`, `RecordRefund`,
  `AdjustStock`, `RestockProduct` — each owning its transaction.
- The order state machine with all transition rules.
- The inventory ledger with its invariant and reconciliation command.
- Full CRUD API with allowlisted filtering, sorting and pagination.
- Frontend list and detail screens for each module.
- Order creation and the status-transition flow.
- The realistic seeder: 3 years of data, 100k orders, price and cost changes mid-history.
- The full business-rule and concurrency test suites.

**Done when:** an order can be created, confirmed, fulfilled, cancelled and refunded with
stock moving correctly and reversibly at every step, the ledger invariant holds under the
concurrent test, and the role matrix test passes for every endpoint.

**Outcome.** All met. 156 backend tests (789 assertions), 151 frontend tests, 24 browser
E2E tests. Pint clean, PHPStan level 6 clean, ESLint and Prettier clean, build green.

The seeded dataset is the part worth keeping in mind for Phase 04: 2,277 orders across 36
months, in which **52% of order lines carry a `unit_cost` that differs from the current
catalog cost**. A metric that reads `products.cost` instead of the snapshot will produce a
visibly wrong number on more than half the data rather than passing unnoticed.

Four defects were found and fixed by building it:

1. `AuthorizationException` returned the generic `http.error` code, because Laravel converts
   it into a plain 403 `HttpException` before the handler runs — the same failure shape as
   the Phase 01 throttle bug. Both arms now match on status as well as class.
2. The inventory resource exposes `product_id` rather than an `id`, so `DataTable` produced
   duplicate React keys — which in a data table means showing one product's numbers under
   another product's name on re-render.
3. The E2E suite signed in once per test, which put twenty-odd logins inside two minutes
   against an API that rate-limits login to ten per minute. The limit is right; the suite
   was wrong. Sessions are now established once per role by a setup project, which also cut
   the authenticated specs from 5–12s each to 1–3s.
4. E2E ran against `next dev`, whose on-demand route compilation made the first visit to a
   page slow enough to blow assertion timeouts intermittently. It now runs against a
   production build, which is also what ships.

**One consequence of #4:** the component gallery is gated on `NEXT_PUBLIC_ENABLE_GALLERY`
rather than `NODE_ENV`, so it can be verified in the same production build as every other
screen. A real deployment simply never sets the flag.

---

## Phase 04 — Metrics, analytics & dashboard ✅ *(complete)*

**Goal.** The reason the product exists.

- The `Period` and comparison resolvers, with full timezone and fiscal-year tests.
- One metric class per entry in METRICS.md §2.
- The fixture dataset with hand-calculated expected values, and its test suite.
- `/analytics/summary`, `/timeseries`, `/breakdown`; `/dashboard`.
- Cost-blind metric handling — not calculated, not serialised.
- Chart wrappers over Recharts, lazy-loaded.
- The dashboard: KPI grid, revenue and profit trends, top products and customers,
  low-stock panel.
- The analytics page: period selector, comparison basis, breakdowns, Top-N with Other.
- **Performance measurement against the seeded dataset**, deciding ADR-009 on evidence.

**Done when:** every metric matches its hand-calculated value, every null and zero case
behaves as documented, Staff receive no cost keys, and dashboard p95 is recorded.

**Outcome.** All met. 199 backend tests (933 assertions, 1 documented skip), 151 frontend
tests, 36 browser E2E tests. Pint clean, PHPStan level 6 clean, ESLint and Prettier clean,
production build green.

All twenty metrics in METRICS.md §2 are defined once, in `MetricCalculator`, and verified
against `MetricFixture` — a deliberately small dataset whose every expected value is
hand-calculated in the docblock, arithmetic shown. The fixture reprices its widget *after*
every order is committed, so any metric reading `products.cost` instead of the line-item
snapshot fails immediately rather than on a plausible-looking number.

**ADR-009 was decided against the rollup table, on evidence that nearly went the other way.**
The first measurement — a naive loop over HTTP — reported a dashboard p95 of 774 ms and
would have justified building it. Measuring the calculator directly gave 86 ms, and
`GET /health`, which does no work at all, cost 561 ms on its own. The framework boot was
being counted as analytics cost. Attributable time is ~103 ms, so live computation stays,
and the trigger in ADR-009 stands unchanged for when the dataset grows.

The measurement did find a real defect on the way: the summary endpoint was issuing 52
queries because every metric re-aggregated the same rows. A memoised per-period aggregate
cut it to 16. That was the actual problem — and no rollup table would have fixed it, only
hidden it behind a cache.

Three other things worth recording:

1. **A ratio's change is in percentage points, not percent.** A margin moving 38.4% → 34.2%
   is −4.2 pp; calling it −10.9% is a different claim about the business. `MetricTile`
   selects `change_absolute` over `change_pct` on format, and the E2E suite asserts the
   rendered unit.
2. **The chart palette failed a colour-blindness check that a code comment claimed it had
   passed.** Simulated under Viénot deuteranopia, two adjacent series sat at ΔE 1.8 — for a
   deuteranopic reader, indistinguishable. Redesigned to ΔE 16.4 (light) and 23.0 (dark),
   and the test that had been asserting WCAG contrast ratios — which cannot detect this —
   was replaced with the simulation itself.
3. **`bcdiv` truncates rather than rounds,** which produced a gross margin of 0.555555 where
   the hand calculation said 0.555556. Fixed by dividing at a higher scale before rounding,
   not by adjusting the expected value.

**One documented deviation:** `TimeSeries` and `Breakdown` write their own SQL rather than
calling `MetricCalculator` per bucket, which would be one query per day of the period. They
are guarded by reconciliation tests asserting that the buckets sum to the summary figure, so
the two paths cannot silently disagree.

---

## Phase 05 — Expenses, insights, audit & export ✅ *(complete)*

- Expenses and expense categories, full stack.
- Profit metrics completed (they depend on expenses).
- The L3 insight rules with their thresholds, suppression and volume guards.
- The insights feed on the dashboard.
- `activity_logs` with the audit observer and central redaction.
- The activity log screen with cursor pagination.
- CSV export on every table view, with ability gating, row caps, rate limits, streaming and
  formula-injection escaping.
- Users and Roles administration, including the last-Owner guard.
- Business settings screen.

**Done when:** every security test in SECURITY.md §15 passes and every module writes to the
audit log.

**Outcome.** All met. 327 backend tests (1,255 assertions, 1 documented skip), 159 frontend
tests, 50 browser E2E tests — green on three consecutive full runs. Pint clean, PHPStan level 6 clean, ESLint and Prettier clean,
production build green.

Expenses and the profit metrics that depend on them were already delivered with the Phase 03
module sweep and Phase 04's calculator, so this phase added the expense category filter and
left the rest alone rather than rebuilding it.

**The audit log is an observer, not a line in each controller.** The requirement is "every
write is audited", and a call in each controller satisfies that only until someone adds a
controller. `AuditObserver` is attached by `#[ObservedBy]` on the model, so the model itself
declares that it is audited and a new endpoint inherits it. Domain services NAME their event
— `order.cancelled` with its reason, rather than `order.updated` with a status diff — through
an override the observer consumes, which keeps one write path while letting the operation say
what actually happened.

Four decisions inside it are worth recording:

1. **A redacted key is dropped, not masked.** `"password": "[redacted]"` still puts the key in
   a permanent table with no delete path. The fact that a secret changed is preserved by the
   ACTION instead: `user.password_changed` is written with an empty diff.
2. **Seeding pauses auditing.** A row written while fabricating three years of history would
   name the seeding process as the actor, the console as the origin and today as the moment —
   for an order the dataset claims was placed fourteen months ago. Every field would be false,
   and a log that lies about its own provenance is worse than a gap.
3. **The log redacts cost, because it is otherwise a back door to it.** Every other surface
   omits cost via `mergeWhen`; a diff reading `{"before":{"cost":"4.20"}}` would undo all of
   that on a screen reached by a different ability.
4. **Cursor pagination, with an id tiebreaker.** `created_at` has one-second resolution and a
   confirm writes several rows inside one second, so ties on the ordering column let the seek
   land mid-group and silently drop the rest. An audit log that omits rows when paged is not
   an audit log.

**Export inherits redaction rather than reimplementing it.** `CsvExport` serialises each row
with the same resource class the screen uses, so a cost-blind role's `ProductResource` omits
`cost`, the exporter never sees the key, and the column is not written — there is no second
rule to forget. Two things were found while building it:

- `toArray()` does NOT return `mergeWhen`'s merged keys; it returns an int-keyed `MergeValue`
  that Laravel flattens later in the response pipeline. Reading it directly dropped the cost
  column for *every* role. It failed closed and raised no error, so the only symptom was a
  missing column in a file nobody diffs against the screen. `resolve()` runs the same
  filtering the API response does.
- `Content-Disposition` is not CORS-safelisted, so the browser hid the server's filename from
  JavaScript and the client silently fell back to a name it invented. Now exposed explicitly.

**One documented narrowing of SECURITY.md §9.6.** Applied literally, "escape any cell
beginning `-`" turns every refund, loss and downward adjustment in a financial export into
text, so the column will not sum — for an export whose purpose is to be summed, that is the
feature not working, and the predictable result is someone stripping the escaping wholesale.
A cell is therefore left alone when it is a well-formed number. The guarantee is unchanged: a
string that parses as a number cannot also be a formula, and `-1+1`, `-A1` and
`-HYPERLINK(...)` are all still escaped. The rule is narrower in wording and identical in
effect, and it is a single tested predicate rather than a judgement left to each call site.

**The insights feed says why it is empty.** An empty feed has two entirely different meanings
— "nothing is wrong" and "the rules were not allowed to run" — and a UI rendering both as
blank space asserts the first when the second is true. Since the dashboard's default window is
a rolling thirty days, which always includes today, suppression is the state most readers will
meet most often, so the endpoint returns the reason and the screen prints it.

**The settings read was tightened during the phase.** It was first opened to every role on the
argument that currency and timezone are formatting inputs rather than secrets. The argument
did not survive contact with the code: every screen that formats money already receives both
in the META of an analytics response it was making anyway, so nothing outside the settings
screen needed the endpoint. Widening a route on a justification the code does not rely on is
how default-deny erodes, so it sits behind `settings.view` like everything else.

**The rate limits documented in SECURITY.md §7 were not the limits in force.** Found by the
E2E export test, which passed alone and failed after the rest of the suite had browsed the
application. Laravel keys an unnamed `throttle:X,Y` middleware on the user's id alone, so the
export group's `throttle:10,60`, nested inside the API group's `throttle:120,1`, shared one
counter with it: ten ordinary requests and a user's first export of the day was refused, and
every export spent the counter twice, so the sixth was refused too. Analytics and the login
backstop had the same flaw (a monitor polling `/health` could lock the office out of signing
in). Every limit is now a named limiter with its own key, and `RateLimitIsolationTest` fails
against the old routes and passes against the new ones. Two neighbouring gaps closed with it:
the JSON error renderer dropped the exception's headers, so no 429 carried the `Retry-After`
§7 requires, and the login throttle — a ValidationException, which has no headers — now
attaches it explicitly. The existing login rate-limit test now asserts the header.

**Before that was found, the failure was blamed on the wrong cause** — and the correction is
worth keeping. The first diagnosis was that repeated debugging runs had spent the hourly export
budget, and the audit log seemed to support it. The next morning, with the budget certainly
fresh, the same test failed the same way, and the audit log showed **zero** exports in the hour
while the endpoint returned 429. A refusal with no matching spend is not a budget problem; it is
a counting problem, which is what led to the shared key. The two export tests were merged into
one download regardless, since two downloads to make two assertions about one file was waste.
Two other E2E failures were locator ambiguities rather than product defects — a hidden
`<option>` and the owner's own address in the header — and one waited on a clock instead of on
the server's answer, which the single-threaded dev API made intermittent.

---

## Phase 06 — Hardening & deployment

- Full security test sweep; rate limiting verified end to end.
- Security headers and CSP.
- Query optimisation against measured slow paths; ADR-009 implemented if triggered.
- Error tracking, structured logging with request ids.
- Backup strategy.
- Deployment: both applications, cookie domains, queue worker if needed, migration process.
- Staging environment with seeded data.
- The full E2E suite green against staging.

**Done when:** the application runs in production with monitoring, backups and a rollback
procedure.

---

## Phase 07 — Arabic / RTL localization ✅ *(complete)*

Deliberately a phase of its own, and deliberately late — the preparation in Phase 02
(logical properties, centralised strings, `Intl` formatting) is what makes it a contained
piece of work rather than a rewrite.

- A localization library, seeded from `lib/strings.js`.
- Arabic translation of the interface.
- `dir="rtl"` support verified across every screen.
- RTL-correct charts, tables and number formatting.
- Arabic-Indic numeral option.
- Language switcher, persisted per user.

**Done when:** every screen is fully usable in Arabic RTL with no layout defects.

**Outcome.**

- An in-house translation engine and two dictionaries instead of a library (ADR-017). Plural
  forms come from `Intl.PluralRules`, so Arabic counted nouns agree with the number
  (منتج واحد، منتجان، ٣ منتجات، ١١ منتجًا).
- Language and digits are saved on the account (`users.locale`, `users.numerals`): Western
  digits by default, Arabic-Indic as a choice. The server answers in the same preference —
  validation and business-rule messages, insights, comparison phrases, CSV headers.
- Every screen is translated except the development-only component gallery, which stays in
  English on purpose.
- IBM Plex Sans Arabic; no letter-spacing in Arabic; charts mirror (time runs right to left,
  value axis on the right); figures are isolated with `<bdi>` so signs and currency keep their
  place inside Arabic sentences.
- Guards: `tests/i18n.test.js` (key and placeholder parity, no untranslated sentence, no literal
  digit, every key used in source exists), `TranslationParityTest` and `LocalizationTest` on the
  server, and `e2e/i18n.spec.js` (saved preference, RTL from the first byte after a reload,
  Arabic-Indic digits, the sign-in page before an account is known).

**Found and fixed along the way.**

- **Weekly analytics were all zero in Arabic.** Carbon's default week start follows the app
  locale, and Arabic weeks start on Saturday; SQL grouped from Monday, so no bucket matched.
  Week boundaries are now named explicitly, with a regression test comparing both languages.
- **Chart labels were drawn across their own bars in RTL.** An inherited `direction: rtl` flips
  SVG `text-anchor`. The drawing surface is now always LTR and the charts mirror explicitly.
- **The cancel-order reason field never rendered.** `ConfirmDialog` ignored its children, so
  the required reason input was invisible. Present since Phase 03.
- Chart period labels were the API's English CSV labels; they are now formatted on the client
  in the reader's language and digits. The analytics trend caption printed "dayly".

---

## Phase 08 — Post-MVP depth

Ordered by likely value, not committed:

1. Saved report definitions, queued PDF generation, scheduled email delivery (running as
   the owning user).
2. The refund ledger (ADR-005), unlocking refund-date reporting and unit-level refunds.
3. Two-factor authentication and session management.
4. Cohort retention and RFM customer segmentation.
5. Multi-location inventory (ADR-006).
6. Purchase orders and suppliers.
7. Category hierarchy (ADR-008).
8. Inventory valuation snapshots, unlocking Inventory Turnover (ADR-014).
9. Anomaly detection over dense history (ADR-010).
10. Multi-tenancy (ADR-001) — only if the product is sold to a second business.

---

## Sequencing principles

1. **Retire architectural risk first.** Phase 01 proves the hardest seam before anything
   depends on it.
2. **Components before screens.** Phase 02 prevents ten screens inventing ten button styles.
3. **Source data before metrics.** Phase 04 cannot be validated without Phase 03's realistic
   data.
4. **Measure before optimising.** ADR-009 is decided in Phase 04 on numbers, not intuition.
5. **Each phase ends demonstrable.** No phase leaves the system in a state nobody can look at.
