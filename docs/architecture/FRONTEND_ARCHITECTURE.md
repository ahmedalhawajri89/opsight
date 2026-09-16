# Opsight — Frontend Architecture

Phase 00 document. Nothing here is implemented yet.

**Next.js (App Router) · React · JavaScript · Tailwind CSS. No TypeScript anywhere.**

---

## 1. Directory structure

```
frontend/
├── app/                          # Routing only — thin
│   ├── layout.js
│   ├── page.js                   # → redirect to /dashboard or /login
│   ├── globals.css
│   ├── (auth)/
│   │   └── login/page.js
│   └── (app)/                    # Authenticated shell
│       ├── layout.js             # Sidebar + topbar + auth guard
│       ├── dashboard/page.js
│       ├── orders/
│       │   ├── page.js
│       │   ├── new/page.js
│       │   └── [id]/page.js
│       ├── customers/{page.js,[id]/page.js}
│       ├── products/{page.js,[id]/page.js}
│       ├── inventory/page.js
│       ├── expenses/page.js
│       ├── analytics/page.js
│       ├── activity/page.js
│       └── settings/{page.js,users/page.js}
│
├── components/
│   ├── ui/                       # Primitives: Button, Input, Select, Dialog,
│   │                             #   Badge, Tooltip, Skeleton, Tabs
│   ├── data/                     # DataTable, Pagination, FilterBar, EmptyState,
│   │                             #   ErrorState, SortHeader
│   ├── charts/                   # Wrapped chart components (the only Recharts importers)
│   └── layout/                   # Sidebar, Topbar, PageHeader, Breadcrumbs
│
├── features/                     # Feature-owned logic and composites
│   ├── auth/         {AuthProvider.js, LoginForm.js, useAuth.js, Can.js}
│   ├── dashboard/    {KpiGrid.js, RevenueTrend.js, InsightsFeed.js, useDashboard.js}
│   ├── orders/       {OrdersTable.js, OrderForm.js, OrderStatusBadge.js,
│   │                  StatusActions.js, useOrders.js}
│   ├── customers/ · products/ · inventory/ · expenses/ · analytics/ · activity/ · users/
│
├── lib/
│   ├── apiClient.js              # fetch wrapper: base URL, credentials, CSRF, errors
│   ├── queryClient.js            # TanStack Query configuration
│   ├── permissions.js            # can() over the abilities list from /me
│   ├── format.js                 # money, number, percent, pp, date, relative time
│   ├── periods.js                # preset → {from,to}, labels, comparison bases
│   └── constants.js              # statuses, roles, query keys
│
├── services/                     # One module per API resource; owns every URL
│   ├── auth.js · orders.js · customers.js · products.js
│   ├── inventory.js · expenses.js · analytics.js · users.js · activity.js
│
├── hooks/                        # Cross-feature only
│   ├── useDebounce.js · useUrlFilters.js · useMediaQuery.js
│
├── utils/                        # Pure helpers, no React, no network
│   ├── csv.js · array.js · string.js
│
├── tests/                        # Vitest setup + shared test utilities
├── e2e/                          # Playwright specs
├── jsconfig.json                 # Path aliases (@/components, @/lib, …)
├── tailwind.config.js
├── next.config.mjs
└── package.json
```

### File extensions

**`.jsx` for a file containing JSX, `.js` for plain JavaScript.**

This is still a JavaScript-only project; `.jsx` is a JavaScript extension, not a TypeScript
one. The reason is mechanical: Vite's oxc transform decides how to parse a file from its
extension and exposes no override, so a `.js` file containing JSX fails to parse in the test
runner even though Next.js accepts it. Rather than fight the toolchain, the extension states
what is in the file — which also means a glance at a directory listing tells you which
modules render and which are pure logic.

So: `components/`, `features/` and `app/` are `.jsx`; `lib/`, `services/` and `hooks/` are
`.js`. Imports use path aliases without extensions, so this is invisible at call sites.

### Why this split

`components/` is for things with no business knowledge. `features/` is for things that do.
The test: a component that knows what a "confirmed order" is belongs in `features/orders/`;
a component that renders rows and columns belongs in `components/data/`. Without that line,
`components/` becomes a second app directory within three weeks.

`services/` exists so no component holds a URL. When `/api/v1` becomes `/api/v2`, exactly
one directory changes.

**Abstractions deliberately not created:** no repository layer over services, no generic
`useResource` factory, no form-generation engine, no global event bus, no barrel
`index.js` re-export files. Each was considered; each would add indirection before there
is duplication to justify it.

## 2. Rendering model

Sanctum's session cookie lives in the browser, so authenticated data is fetched
**client-side** (ARCHITECTURE.md §3). This is a direct consequence of ADR-002 and is stated
plainly rather than discovered later.

| Rendering mode | Used for |
| --- | --- |
| Server Components | `app/` layouts, static chrome, metadata, route structure |
| Client Components | Everything that reads user data, filters, charts, tables, forms |

Route-level `loading.js` renders the page skeleton immediately; data arrives after the
client mounts. No `getServerSideProps`-style data loading, no server-side API proxying in
the MVP.

If server rendering of data becomes a requirement — for example a public shared report
link — the path is ADR-002's BFF alternative, adopted deliberately, not bolted on.

## 3. Data flow

```
Component → feature hook → TanStack Query → service function → apiClient → Laravel
```

**Rules.**

1. Components never call `fetch` and never see a URL.
2. One service module per resource; it owns paths and parameter shapes.
3. Every hook returns the same contract: `{ data, isLoading, isError, error, refetch }`.
4. Query keys encode every input affecting the result:
   `['orders', { page, perPage, filters, sort }]`. Changing a filter is a cache miss, so a
   stale list can never be shown under new filters.
5. Mutations invalidate explicitly. Confirming an order invalidates `['orders']`,
   `['inventory']`, `['dashboard']` and `['analytics']`, because stock and every metric
   just moved.
6. No global client state library. Server state is TanStack Query's; auth is one Context;
   filter state lives in the URL (§7). Redux and Zustand would hold almost nothing.

**Why TanStack Query.** Request deduplication, caching keyed by filters, background
refetch, stale-while-revalidate and mutation invalidation are all needed by a filtered,
paginated, multi-widget dashboard. Hand-rolling them is several hundred lines of
subtly-wrong `useEffect`. This is a justified dependency, unlike a state library that
would duplicate it.

## 4. API client

`lib/apiClient.js` is the only module that calls `fetch`.

Responsibilities:

- Prefixes `NEXT_PUBLIC_API_URL`.
- Sends `credentials: 'include'` on every request.
- Ensures the CSRF cookie exists before the first unsafe request, and sends `X-XSRF-TOKEN`
  on every `POST`/`PUT`/`PATCH`/`DELETE`.
- Sets `Accept: application/json` so Laravel never returns an HTML error page.
- Serialises filter and sort parameters in the documented `filter[key]=value` form.
- **Normalises every failure into one shape:**
  `{ status, code, message, errors, requestId }` — including network failures, which become
  `status: 0`. Components then handle one error shape, never two.
- On `401`, fires a single session-expired event; the auth provider clears state and
  redirects to `/login?expired=1`. This happens once globally, not in every hook.
- Never retries mutations. Retries `GET` once on a network error only.

## 5. Authentication state

`features/auth/AuthProvider.js` holds `{ user, abilities, status }` where status is
`loading | authenticated | unauthenticated`.

Flow:

1. On mount, call `GET /me`.
2. `200` → authenticated. `401` → unauthenticated.
3. The `(app)` layout renders a full-page skeleton while `loading`, and redirects to
   `/login` when `unauthenticated`. Protected content never renders for an unknown user,
   not even for one frame.
4. Login posts credentials, then refetches `/me`; the cookie is set by the server and the
   client never touches a token.
5. Logout posts to the API, clears the query cache entirely, then redirects. Clearing the
   cache matters — otherwise the next user on a shared machine sees the previous user's
   cached figures.

**No token is ever stored in `localStorage` or `sessionStorage`.** The session is an
HttpOnly cookie and is unreadable by JavaScript by design.

## 6. Permission handling

`lib/permissions.js` exposes `can(abilities, 'orders.confirm')`. `useAuth()` provides a
bound `can(ability)`.

```jsx
<Can ability="orders.cancel">
  <Button variant="danger" onClick={cancel}>Cancel order</Button>
</Can>
```

Rules:

- **Components check abilities, never role names.** `can('expenses.view')`, never
  `user.role === 'manager'`. Role-name checks in components are how a permission change
  turns into a bug hunt.
- The abilities list comes from `/me`. There is no copy of the role-to-ability table in
  JavaScript.
- Frontend permission checks are **usability, not security**. The server withholds the data
  regardless (ROLES_AND_PERMISSIONS.md §5).
- Navigation items are filtered by ability, so a user never sees a link that will 403.
- Components must tolerate a metric key being absent from a response, since cost fields are
  omitted rather than nulled for cost-blind roles.

## 7. Filters, sorting and pagination

**Filter state lives in the URL**, via `hooks/useUrlFilters.js`:

```
/orders?status=confirmed&from=2026-08-01&to=2026-08-31&sort=-placed_at&page=2
```

Why: a filtered view is shareable, survives a refresh, works with the back button, and is
reproducible in a bug report. Component state does none of that.

- The URL is the single source of truth; the hook parses it, validates against the
  endpoint's allowlist, and writes changes back with `router.replace` (no history spam for
  keystrokes).
- Text search is debounced 300 ms before it reaches the URL.
- Pagination is server-side; the client sends `page` and `per_page` and renders `meta`.
- Changing any filter resets `page` to 1 — otherwise a narrowed result set strands the user
  on an empty page 7.

## 8. Tables

`components/data/DataTable.js` is built in-house. **No table library.**

Justification: sorting, filtering and pagination all happen on the server, so the client
table is presentational — rows in, cells out. TanStack Table's value is client-side data
manipulation the application deliberately does not do.

Driven by a column config:

```js
const columns = [
  { key: 'reference', header: 'Order',   sortable: true,
    cell: (row) => <OrderLink order={row} /> },
  { key: 'placed_at', header: 'Date',    sortable: true, align: 'left',
    cell: (row) => formatDate(row.placed_at) },
  { key: 'total_amount', header: 'Total', sortable: true, align: 'right',
    numeric: true, cell: (row) => formatMoney(row.total_amount) },
];
```

Requirements:

- `numeric: true` applies right alignment and tabular numerals (UI_UX_DIRECTION.md).
- Semantic `<table>` markup with `<th scope>`, sortable headers as buttons carrying
  `aria-sort`.
- Loading renders a skeleton with the **correct column count**, so the layout does not jump.
- Empty and error states are first-class props, never an afterthought.
- Sticky header, horizontal scroll on narrow screens, optional row density.
- Row actions are gated by ability.

## 9. Charts

`components/charts/` wraps **Recharts**. It is the only directory permitted to import it,
so the library is replaceable in one place.

Wrappers: `<LineChartCard>`, `<BarChartCard>`, `<AreaChartCard>`, `<Sparkline>`.

Each wrapper owns: theme tokens, axis and grid defaults, number and date formatting,
tooltip content, the loading skeleton, and the empty state. A page passes data and
labels — never axis configuration, and never colours.

Requirements:

- Charts render from the API's time-series shape directly, with **no client-side metric
  arithmetic**. A chart that computes its own percentages is a second metric definition.
- Zero-value buckets are rendered, not dropped (METRICS.md §3).
- Partial final buckets render dashed or hatched, with a legend note.
- Bar charts start at zero. Line charts may not, but must label the axis clearly.
- Every chart has an accessible fallback: a visually-hidden data table or a toggle to a
  table view. A chart is not the only route to its numbers.
- No gradient fills, no 3D, no entry animations beyond a brief opacity fade.

## 10. Forms

**react-hook-form** for form state. No client schema validation library (ADR-012).

- The server is the source of truth for validation. The client performs required/format
  checks for immediate feedback only.
- A 422 response maps field-by-field onto form errors; the client never invents messages
  for server-side rules.
- Submit buttons disable during submission and forms guard against double submission —
  double-confirming an order would double-decrement stock.
- Destructive actions (cancel order, deactivate user, delete expense) require a confirm
  dialog stating the consequence in business terms, not "Are you sure?".
- Unsaved-changes warning on navigation away from a dirty form.

## 11. Loading, empty and error states

Every data-bound surface specifies all four states. A component that renders only the
success case is incomplete and is treated as such in review.

| State | Treatment |
| --- | --- |
| **Loading** | Skeleton matching the real layout's dimensions — never a centred spinner, which guarantees a layout shift. Existing data stays visible during background refetch, with a subtle refreshing indicator. |
| **Empty (no data yet)** | Explains what the surface will show and offers the action that creates the first record. |
| **Empty (filters match nothing)** | Distinct from the above. Says which filters are active and offers to clear them. Conflating these two is a common and genuinely confusing mistake. |
| **Error** | Plain-language message, the request reference id, and a retry button. Scoped to the widget — one failing chart must not blank the dashboard. |
| **Forbidden (403)** | The surface is not rendered at all, because navigation is ability-filtered. A direct URL hit shows a plain "not available for your role" page. |

## 12. Dependencies

Minimal and justified. Every addition needs a reason recorded here.

| Package | Purpose | Justification |
| --- | --- | --- |
| `next`, `react`, `react-dom` | Framework | Required |
| `tailwindcss` | Styling | Required |
| `@tanstack/react-query` | Server state | §3 |
| `recharts` | Charts | Wrapped and replaceable (§9) |
| `react-hook-form` | Form state | Avoids hand-rolled controlled-input plumbing |
| `date-fns` | Date maths and formatting | Tree-shakeable; used for period presets |
| `clsx` | Conditional class names | Tiny; avoids template-literal class soup |

**Not installed:** any UI kit (MUI, Chakra, Ant, shadcn scaffolding), any state library,
any table library, any schema validator, any icon mega-package (a small hand-picked SVG set
instead), any animation library, any date-picker library until the built-in period presets
prove insufficient.

`npm` is the package manager — `pnpm` and `yarn` are absent from the environment. The
lockfile is committed.

## 13. Performance

- Route-level code splitting is automatic; chart components are additionally lazy-loaded,
  since Recharts is the heaviest dependency and most routes do not need it.
- Dashboard widgets fetch in parallel and render independently. One slow widget must not
  block the page.
- `next/font` self-hosts the typeface; no render-blocking font request to a third party.
- Tables virtualize only if a view exceeds 200 rows, which server pagination should
  prevent. Virtualization before that is complexity without benefit.
- Budget: dashboard interactive under 2 s on a mid-range laptop over a typical connection;
  initial JS under 200 KB gzipped excluding lazy chunks.
