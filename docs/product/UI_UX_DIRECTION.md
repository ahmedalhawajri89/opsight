# Opsight — UI/UX Direction & Design System Requirements

Phase 00 document. **No UI is built in this phase.** This defines what will be built and,
just as importantly, what will not.

---

## 1. Design thesis

Opsight is a **working instrument**, not a showcase. Its users open it several times a day
to answer a specific question and get on with their work. The interface earns its keep by
making numbers readable and comparisons obvious — not by being memorable.

The reference points are financial terminals, analytics consoles and well-made accounting
software: dense, quiet, typographically disciplined, with visual weight spent on data and
almost nowhere else.

**The test for any design decision:** does this help someone read a number faster or trust
it more? If not, remove it.

## 2. Explicitly rejected

These are common in dashboard templates and are prohibited in Opsight:

| Rejected | Why |
| --- | --- |
| Gradient backgrounds and gradient KPI cards | Decoration competing with data; also breaks number legibility |
| Glassmorphism, blur, translucency | Reduces contrast, which is the one thing a data UI cannot spare |
| Large corner radii (12px+, pill cards) | Wastes density and reads as consumer app, not instrument |
| Heavy drop shadows and floating card stacks | Hierarchy should come from spacing, weight and rule lines |
| Decorative entry animations, counting-up numbers | A number that animates is unreadable while it animates, and implies precision it does not have |
| Full-colour icon sets, illustrations, mascots | Occupies space that data should hold |
| Rainbow categorical palettes | Colour must encode meaning; when everything is coloured, nothing is |
| Dark-purple "analytics SaaS" aesthetic | Generic; the direction here is neutral and quiet |
| Sidebar "pro upgrade" blocks, decorative avatars | Not applicable to an internal tool |

**Every visual effect must justify itself against readability.** The default answer is no.

## 3. Typography

Typography carries most of the hierarchy, so it is specified first.

**Typefaces.** One UI sans throughout — **Inter** (or Geist), self-hosted via `next/font`.
A monospace face (JetBrains Mono or ui-monospace) for identifiers: SKUs, order references,
API reference ids.

**The tabular-numerals rule.** Every number that appears in a column, a KPI tile, a chart
axis or a comparison **must** use tabular figures (`font-variant-numeric: tabular-nums`).
Proportional digits make columns of currency ragged and genuinely harder to scan. This is
a hard requirement and a review checklist item, implemented as a Tailwind utility applied
by the `numeric` column flag and the KPI component.

**Scale** (rem, 16px base):

| Token | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| `display` | 2.25 / 1.15 | 600 | KPI hero figure |
| `h1` | 1.5 / 1.25 | 600 | Page title |
| `h2` | 1.125 / 1.3 | 600 | Section heading |
| `h3` | 1.0 / 1.4 | 600 | Card heading |
| `body` | 0.875 / 1.5 | 400 | Default UI text |
| `body-sm` | 0.8125 / 1.45 | 400 | Table cells, dense contexts |
| `label` | 0.75 / 1.3 | 500, +0.02em | Field labels, table headers, metric captions |
| `mono` | 0.8125 / 1.4 | 400 | SKUs, references |

0.875rem body is deliberate. This is a dense information tool; 16px body text in a data
table wastes a third of the viewport.

**Rules.**

- Maximum three weights: 400, 500, 600. No 700+ in the interface.
- Uppercase only for `label`, never for headings or data.
- Numbers right-aligned in tables; text left-aligned; headers align with their column.
- Currency symbol and magnitude are typographically de-emphasised relative to the digits.

## 4. Colour

A restrained neutral system with one accent and a strictly reserved semantic set.

**Neutrals** — the interface is built almost entirely from these.

```
Light                              Dark
--surface        #FFFFFF           #0E1116
--surface-sunken #F7F8FA           #151A21
--surface-raised #FFFFFF           #1B212A
--border         #E3E6EB           #262D38
--border-strong  #CBD1DA           #333C49
--text           #14181F           #E8ECF2
--text-muted     #5B6472           #96A1B0
--text-subtle    #8B95A3           #6E7986
```

**Accent** — one colour, used for interactive affordances and the primary data series only.

```
--accent         #2563A8    (deep restrained blue)
--accent-hover   #1E5191
--accent-subtle  #EAF1F9  /  #16283D
```

**Semantic** — reserved for meaning, never for decoration.

```
--positive  #1B7A4B   favourable change
--negative  #B4342B   unfavourable change
--warning   #A66412   attention, low stock
--neutral   --text-muted   no change / not applicable
```

**Rules.**

1. Positive and negative are **directional in business terms, not arithmetic**. Expenses
   rising is negative even though the number grew; cancellation rate falling is positive
   even though it shrank. Each metric declares its favourable direction, and the KPI
   component reads that flag. Colouring by sign alone is a real reporting error.
2. **Never colour alone.** A change is always an arrow or `+`/`−` sign **and** a colour, so
   colour-blind users and greyscale prints lose nothing.
3. Categorical chart palette: a maximum of six hues, derived from the accent by rotation
   with controlled lightness, checked for deuteranopia and protanopia distinguishability.
   Beyond six series, the chart aggregates into "Other" instead of adding colours.
4. Sequential scales (heatmaps) are single-hue light-to-dark. Diverging scales are used
   only where a meaningful midpoint exists.
5. Contrast: **WCAG AA minimum** — 4.5:1 for body text, 3:1 for large text and for the
   boundary of any meaningful graphical element. Verified with an automated check, not by eye.

**Light is the product; dark is complete but explicit.** Every colour is a CSS custom
property defined for both themes, both are contrast-tested, and no component hard-codes a
hex value. *Revised in the dashboard redesign:* the default no longer follows the operating
system. The charts, tones and density were designed and verified on a light ground, and an
OS set to dark was silently giving users a theme nobody had reviewed. Dark applies only via
`data-theme="dark"` on `<html>`; a user-facing toggle is not yet built.

**Referencing a token from markup** is `bg-(--color-surface)` in Tailwind v4. The v3 form
`bg-` + `[--color-surface]` compiles to invalid CSS in v4 and the browser drops it without
an error — which is how no token in this document reached the screen between Phase 02 and
the redesign, while every test passed. `tests/tokens.test.js` refuses the old form.

## 5. Layout and density

**Shell.**

```
┌───────────┬────────────────────────────────────────────┐
│           │  Topbar: breadcrumb · period · search · user│
│  Sidebar  ├────────────────────────────────────────────┤
│  240px    │  Page header: title · actions               │
│  icons +  ├────────────────────────────────────────────┤
│  labels   │  Filter bar (sticky)                        │
│           ├────────────────────────────────────────────┤
│  collapses│  Content — 12-column grid, 16px gutter      │
│  to 64px  │                                             │
└───────────┴────────────────────────────────────────────┘
```

- Sidebar is persistent, grouped (Operations / Analysis / Administration), filtered by
  ability, collapsible to icons with tooltips, and remembers its state.
- The **period selector is global** and lives in the topbar, because it applies across
  dashboard, analytics and most tables. Making it per-page would have users setting the
  same range repeatedly.
- The filter bar is sticky, so filters stay reachable while scrolling a long table.
- Content max-width 1600px. Data tables are permitted the full width — constraining a
  wide table to a reading measure helps nobody.

**Spacing.** 4px base scale: 4, 8, 12, 16, 24, 32, 48. Nothing off-scale.

**Radii.** `sm` 4px (controls, badges), `md` 6px (icon tiles, dialogs), `lg` 8px (panels).
Nothing larger. No pills except status badges, where the shape itself carries meaning.
*Revised in the redesign* from 3/5px: on white panels over an off-white ground, 5px corners
read as unfinished rather than as restraint.

**Borders first, then one hairline.** Panels are a 1px border on `--surface` with
`--shadow-card` — a 1px, 4%-opacity lift that separates white from the off-white ground
without a heavier frame. Genuinely floating layers get `--shadow-overlay`. Two shadow
tokens, no elevation scale.

**Hierarchy by tier, not by frame.** A group of figures that describe one period is ONE
panel divided by hairlines (the dashboard KPI band), not a grid of identically framed
tiles. Twelve equal boxes give the eye no place to start.

**Density modes.** Comfortable (44px rows) and Compact (32px rows), user-selectable and
persisted. Compact exists because a manager reviewing 200 orders wants more rows, and that
is a legitimate preference rather than a niche one.

## 6. Data display

### KPI tile

The most-repeated component in the product, so it is specified exactly.

```
┌─────────────────────────────────┐
│ NET REVENUE                  ⓘ  │   label, 0.75rem, muted, uppercase
│ BHD 48,210.50                   │   display, 600, tabular
│ ▲ 9.6%   vs prev. 43,990.00     │   direction-coloured + arrow + basis
└─────────────────────────────────┘
```

Requirements:

- The comparison basis is **always stated in words**, never implied. "vs previous 30 days",
  not a bare percentage.
- The ⓘ tooltip gives the metric's plain-language definition, taken from METRICS.md, so a
  user can always find out what a number means without leaving the page.
- `null` renders as `—` with a tooltip explaining why — "no orders in this period" — never
  as `0`, `∞`, `NaN` or a blank.
- A partial period is badged **Incomplete** on the tile itself.
- Sparklines are optional, drawn without axes, and never the only way to see the trend.

### Tables

Tables are the primary interface for operational data and get the most care.

- Sticky header; zebra striping **off** by default (border rules are quieter and equally
  effective); hover row highlight for tracking across wide rows.
- Numbers right-aligned and tabular; dates in a single consistent format; identifiers in mono.
- Column visibility is user-configurable and persisted per table.
- Row click opens the detail; explicit actions live in a right-aligned menu.
- Sortable headers are buttons with a visible sort indicator and `aria-sort`.
- Bulk selection only where a bulk action genuinely exists.
- Every table view is exportable, subject to ability.

### Charts

- Axis labels and units always present. No unlabelled axes.
- Direct series labelling at the line end where space allows, in preference to a legend —
  it removes a lookup step.
- Tooltips give exact values, not interpolations, and show the comparison value when one
  is active.
- Gridlines are horizontal only, at the lightest border token.
- Comparison series render as a muted dashed line behind the primary series.
- Partial final buckets are visually distinct and annotated.
- Every chart offers a "view as table" toggle.

### Status representation

Order status is a small badge with a dot, using the semantic palette and **always** a text
label. Never a bare coloured dot.

```
draft      neutral, outlined
confirmed  accent
fulfilled  positive
cancelled  muted, strikethrough-adjacent treatment
refunded   warning
```

## 7. Interaction

- Every action gives feedback within 100 ms — a state change, a disabled button, a skeleton.
- Optimistic updates only where reversal is trivial. **Never** for order confirmation or
  stock adjustment: showing a success that the server may reject is unacceptable when stock
  is involved.
- Destructive confirmations state the business consequence: "Cancelling this order returns
  12 units to stock and removes BHD 840.00 from August revenue." Not "Are you sure?".
- Toasts for completed background-ish actions; inline messages for anything needing a
  decision. Errors never appear only in a toast that can be missed.
- Motion: 120–160 ms, ease-out, on state transitions only. No page-transition animation, no
  staggered list entrances, no number counting. `prefers-reduced-motion` removes all of it.

## 8. Accessibility

Non-negotiable, and specified now so it is not retrofitted:

- WCAG 2.1 **AA** contrast in both themes, automatically verified.
- Full keyboard operation: every action reachable, logical tab order, visible focus ring
  (2px accent outline, never `outline: none`).
- Tables use semantic markup with `<caption>`, `<th scope>` and `aria-sort`.
- Charts are not the only path to their data; a table view is always available, and chart
  containers carry a text description.
- Live regions announce async results — a completed filter, a saved record, an error.
- Dialogs trap focus, close on Escape, and restore focus to the trigger.
- Form fields have real `<label>` elements; errors are tied via `aria-describedby`.
- Icon-only buttons carry `aria-label`.
- Text reflows to 320px width without horizontal scrolling, except tables, which scroll
  within their own container.

## 9. Responsive behaviour

Desktop-first — this is an operations tool used at a desk — but fully functional down to a
phone, because managers check figures away from one.

| Breakpoint | Behaviour |
| --- | --- |
| ≥ 1280px | Full shell, multi-column dashboard, wide tables |
| 1024–1279px | Sidebar collapses to icons, dashboard to two columns |
| 768–1023px | Sidebar becomes an overlay drawer, dashboard single column, tables horizontally scrollable with the first column pinned |
| < 768px | Tables become stacked record cards showing the 3–4 most important fields; charts simplify; the period selector moves into a sheet |

Below 768px, entry-heavy screens (order creation) are intentionally reduced: the mobile
experience prioritises **reading** figures and **checking** status. Full order entry on a
phone is not an MVP goal, and pretending otherwise would produce a form nobody can use.

## 10. Internationalisation readiness

**Localization is not implemented in the MVP.** English only, one locale. But the following
are required from the first component so that adding Arabic RTL later is a translation
task, not a rewrite:

1. **CSS logical properties everywhere.** Tailwind's `ms-*`, `me-*`, `ps-*`, `pe-*`,
   `text-start`, `text-end`, `border-s`, `border-e`. **No `ml-*`, `mr-*`, `pl-*`, `pr-*`,
   `text-left` or `text-right` in any component.** This is the single highest-leverage
   preparation and is a lint rule, not a guideline.
2. `dir` is set on `<html>` from a single place, and the layout must survive `dir="rtl"`
   without a stylesheet change.
3. **No hard-coded user-facing strings in JSX.** All copy comes from one
   `lib/strings.js` module — a plain JavaScript object, not a localization library. It
   becomes the English dictionary when a library is introduced.
4. Dates, numbers and currency go through `lib/format.js`, which wraps `Intl.*` with an
   explicit locale argument that currently always receives `en`. No manual formatting, no
   string concatenation of currency symbols.
5. No English text baked into images or icons.
6. Layouts accommodate roughly 30% text expansion; fixed-width labels and truncation that
   depends on English word length are avoided.
7. Directional icons (arrows, chevrons, back) are marked so they can mirror; semantic
   icons (search, calendar) are marked so they do not.

## 11. Design system deliverables (Phase 02)

When UI work begins, these ship before feature screens:

1. **Token layer** — Tailwind theme extension defining every colour, type, space, radius
   and shadow token for both themes. No component may use a raw value.
2. **Primitives** — Button (4 variants × 3 sizes), Input, Select, Checkbox, Radio,
   Textarea, DatePicker, Badge, Tooltip, Dialog, Dropdown, Tabs, Skeleton, Toast.
3. **Data components** — DataTable, Pagination, FilterBar, SortHeader, EmptyState,
   ErrorState, StatTile, ComparisonValue.
4. **Chart wrappers** — Line, Bar, Area, Sparkline, each with loading, empty and
   accessible-table states built in.
5. **Layout** — Sidebar, Topbar, PageHeader, PeriodSelector, ContentGrid.
6. **A component gallery route** (development-only) rendering every component in every
   state and both themes. This is the fastest way to catch a broken empty state or an
   unreadable dark-mode token, and it costs one route.

**Review checklist for every UI pull request:**

- [ ] Loading, empty, filtered-empty and error states all implemented
- [ ] Tabular numerals on every number
- [ ] Favourable direction correct, and never colour-only
- [ ] Readable in both themes at AA contrast
- [ ] Fully keyboard operable with a visible focus ring
- [ ] Logical CSS properties only — no `ml/mr/pl/pr/text-left/text-right`
- [ ] No hard-coded colours or user-facing strings
- [ ] No `null` metric rendered as `0`
- [ ] Works at 768px and 375px
