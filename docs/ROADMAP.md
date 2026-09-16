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

## Phase 04 — Metrics, analytics & dashboard

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

---

## Phase 05 — Expenses, insights, audit & export

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

## Phase 07 — Arabic / RTL localization

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
