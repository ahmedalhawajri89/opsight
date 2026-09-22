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

**Typefaces.** **Inter** for Latin and **DIN Next LT Arabic** for Arabic, both self-hosted.
DIN Next is loaded from `frontend/app/fonts` as woff2 at Regular, Medium and Bold (about 50KB
each); the family's UltraLight, Light, Heavy and Black are not shipped, because nothing uses
them. Each character is drawn by the face designed for its script, so a line mixing an Arabic
label with `BHD` or an SKU needs no special handling. JetBrains Mono is kept for identifiers.

**The order of the stack matters more than its contents.** It is
`Inter, DIN Next, Inter Fallback, DIN Next Fallback` — both real faces, then both
metric-matched fallbacks — and it is assembled in `app/layout.jsx` from next/font's own
values. Written the obvious way, as Inter's pair followed by the Arabic pair, it put Inter's
fallback (`local("Arial")`, which has Arabic glyphs) ahead of the Arabic face, and **Arial
drew every Arabic character in the product** — first over IBM Plex, then over DIN Next —
while the Arabic font downloaded on every page. The computed `font-family` looked correct
throughout; only Chrome's platform-font report showed it. `e2e/i18n.spec.js` now asks Chrome
which font drew an Arabic heading, and fails on Arial.

**The tabular-numerals rule.** Every number that appears in a column, a KPI tile, a chart
axis or a comparison **must** use tabular figures (`font-variant-numeric: tabular-nums`),
applied through the `.tabular` utility. Proportional digits make columns of currency ragged
and genuinely harder to scan. Hard requirement, review checklist item.

**Numerals.** Western digits are the project default, in both languages. Arabic-Indic
digits are a per-account opt-in (ADR-017) rather than a second project-wide default, and
nothing else about the interface changes with that choice.

**Scale — seven sizes, and nothing between them.** Defined once in `app/globals.css` under
`@theme`, which is also what redefines Tailwind's own `text-*` utilities, so `text-sm` IS
the scale rather than something that happens to sit near it.

| Utility | Size | Line-height | Use |
| --- | --- | --- | --- |
| `text-xs` | 12px | 1.65 | Table headers, captions, metadata |
| `text-sm` | 13px | 1.65 | Dense body: table cells, secondary lines |
| `text-base` | 14px | 1.65 | Default UI text |
| `text-lg` | 16px | 1.65 | Emphasised body, lead paragraphs |
| `text-xl` | 20px | 1.25 | Card and section headings |
| `text-2xl` | 24px | 1.25 | Page titles |
| `text-3xl` | 32px | 1.25 | The one display line on the sign-in panel |

14px body is deliberate: this is a dense information tool, and 16px body text in a data
table wastes a third of the viewport. Line-height is 1.65 for body sizes in BOTH scripts —
set by Arabic's taller ascenders and diacritics, and applied to Latin too rather than
letting the two languages drift apart — and 1.25 for headings, where the extra leading only
pulls a title apart.

**Measure.** Anything read as prose rather than scanned is capped at 65 characters with the
`.measure` utility.

**Rules.**

- Hierarchy comes from SIZE and WEIGHT. Never from colour alone — a lighter grey is not a
  smaller heading, it is a contrast failure waiting to be filed.
- Weight, by role:

  | Weight | Role | Inter | DIN Next LT Arabic |
  | --- | --- | --- | --- |
  | 400 | Body, data, table cells, descriptions | Regular | Regular |
  | 500 | Labels, table headers, eyebrows, navigation, buttons, badges | Medium | Medium |
  | 600 | Headings and figures | SemiBold | **Bold** |
  | 700 | The wordmark only | Bold | Bold |

  DIN Next LT Arabic has no SemiBold, so 600 resolves to its Bold. That is the intended
  result, not a fallback: Arabic needs about one step more weight than Latin to look equally
  present at the same size. `font-synthesis: none` stops the browser from faking a 600 out
  of Regular, which breaks the joins in a cursive script. Eyebrow labels are 500, not 600 —
  in Latin their uppercase and tracking set them apart, and Arabic has neither, so at 600
  they came out Bold and louder than the items they label.
- Uppercase and letter-spacing only for the 12px eyebrow label, and both are reset under
  Arabic, where tracking breaks the cursive join.
- Numbers align with their column; the currency symbol is de-emphasised relative to the digits.
- A size outside the table is a bug. There is one exception, documented in place: the KPI
  figure uses `clamp()` between two scale steps so an exact money value shrinks to fit
  instead of being rounded or truncated.

## 4. Colour

Colour is assigned by ROLE. `app/globals.css` is the single source of truth: no component
carries a hex value, and every role below is a token with a name that says what it is for
rather than what it looks like. **Revised in the design-system pass (v5)**, which replaced
the single-accent palette with the role set below.

**Surfaces** — the page ground, what sits on it, and the half-step between.

```
--ground         #F5F7FB   the page
--surface        #FFFFFF   cards, panels, fields
--surface-subtle #FAFBFD   table heads, inset strips
--surface-hover  #F2F4F9   a row under the cursor
--surface-selected #EEF0FF the current row
```

**Lines** — three weights: `--border-subtle` inside a panel, `--border` at a card's edge,
`--border-strong` for the boundary of a control (WCAG 1.4.11 holds that one to 3:1).

**Text** — three roles, and **all three clear 4.5:1 on every surface**, including the muted
one. The muted tone marks metadata; it does not mark unimportant text.

```
--text    #0F172A   17.9:1 on surface
--text-2  #475569    7.6:1
--muted   #5C6880    5.6:1   (was #7B879C — 3.9:1, a failure that shipped)
```

**Brand** — the navy identity, reserved for the mark, the primary button and a page header.
A page-sized navy wash belongs to the sign-in screen and nowhere else. `--brand-text` is the
indigo that carries what you can follow (links, the current place in the navigation) and
`--brand-soft` marks that place.

```
--brand #1E2A5E   --brand-text #4F46E5   --brand-soft #EEF0FF
```

**Accent** — ONE warm tone, the only warm tone in the interface chrome, for a live figure, a
state, and the focus ring. Never a surface, a border, or body text.

```
--accent #A16207 (4.9:1)   --accent-strong #854D0E   --accent-soft #FDF3E0
```

**Semantic** — meaning only, never decoration, each with a soft tint for badges and inline
messages: `--success #15803D`, `--warning #B45309`, `--danger #C81E1E`, `--info #1D4ED8`.

> The accent and the warning share a hue family, and to a viewer with deuteranopia they are
> the same colour (ΔE 0.6; ΔE 16.3 to normal vision). That is accepted rather than unnoticed:
> a warning in this interface always carries its icon and its sentence, so colour is never
> the only signal (WCAG 1.4.1). A warm accent that survives red-green colour blindness while
> staying dark enough for a 4.5:1 focus ring does not exist.

**Charts** — a categorical palette that shares nothing with the interface: no chart colour
means "brand", "warning" or "selected", and no interface state is painted in one of them.
Blue, amber, teal, violet, magenta, cyan. (`--chart-5` was the navy brand until this pass —
the one place the two vocabularies had leaked into each other.)

**Radii, by role rather than size**: `--radius-control` 8px, `--radius-panel` 12px,
`--radius-card` 16px, `--radius-pill` 999px.

**Space** is Tailwind's 4px step used at 4 / 8 / 12 / 16 / 24 / 32 / 48. Half-steps exist in
the framework and are not part of this system. Interactive targets are 44px (`h-11`).

**Shadow**: a hairline card lift, a hover lift, an overlay shadow. No third step, and no card
carries both a shadow and a visible border.

Every pair above is held to WCAG AA by `tests/contrast.test.js`, and the six chart colours to
a minimum perceptual distance under simulated protanopia and deuteranopia.

**Rules.**

1. Positive and negative are **directional in business terms, not arithmetic**. Expenses
   rising is negative even though the number grew; cancellation rate falling is positive
   even though it shrank. Each metric declares its favourable direction, and the KPI
   component reads that flag. Colouring by sign alone is a real reporting error.
2. **Never colour alone.** A change is always an arrow or `+`/`−` sign **and** a colour, so
   colour-blind users and greyscale prints lose nothing.
3. Categorical chart palette: a maximum of six hues, separated by lightness as much as by
   hue, and held by `tests/contrast.test.js` to a minimum perceptual distance under
   simulated protanopia and deuteranopia.
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

**Three templates, and no fourth.**

1. **Focus page** — one column, 420–560px, centred, for a screen with a single task and
   nothing to navigate: sign-in, a settings form, a wizard step. `components/layout/FocusColumn.jsx`.
2. **Application shell** — sidebar, page header (title, one line of description, actions),
   content on 12 columns with 24px gutters. `components/layout/AppShell.jsx`.
3. **List / detail** — the list or table at the start edge, the record at the end edge.

**Variety comes from the hero, not the chrome.** Each screen has exactly ONE element that
differs from every other screen — a table, a chart, a form, a KPI row — and everything else
on it is quiet. A page that is interesting twice is interesting nowhere.

**Tables are not put inside cards.** A card is for content that was gathered together; a
table already has its own edges, and wrapping it adds a border that means nothing.

**Decoration is allowed on one surface.** Background grids and gradients belong to the
sign-in screen. Application screens carry none: no pattern, no wash, no gradient.


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
- Motion, revised in the dashboard redesign (v2). Controls: 120–160 ms, ease-out, on state
  transitions. Content: three entrance effects, each short and each played once — panels
  *rise* 6px into place staggered in reading order, sparklines *reveal* from their start
  edge, share and progress bars *grow*; charts draw in over ~800 ms. Nothing loops, nothing
  animates on a refetch (a changed figure must not be disguised by an arriving one), no
  number counting, and no hover lift on panels that are not clickable. `prefers-reduced-motion`
  removes all of it — CSS through a media query, Recharts through `useReducedMotion()`.

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

**Implemented in Phase 07** — English and Arabic (ADR-017). The rules below began as
preparation and remain binding: every new component must follow them.

1. **CSS logical properties everywhere.** Tailwind's `ms-*`, `me-*`, `ps-*`, `pe-*`,
   `text-start`, `text-end`, `border-s`, `border-e`. **No `ml-*`, `mr-*`, `pl-*`, `pr-*`,
   `text-left` or `text-right` in any component.** This is the single highest-leverage
   preparation and is a lint rule, not a guideline.
2. `dir` is set on `<html>` from a single place, and the layout must survive `dir="rtl"`
   without a stylesheet change.
3. **No hard-coded user-facing strings in JSX.** All copy comes from
   `lib/i18n/messages/en.js` and its Arabic twin, through `useI18n().t`. A new string goes
   into both files; `tests/i18n.test.js` fails otherwise.
4. Dates, numbers and currency go through `lib/format.js`, which wraps `Intl.*` with the
   reader's locale tag (`ar-BH-u-nu-arab` for Arabic-Indic digits). No manual formatting, no
   string concatenation of currency symbols, and **no digit written into a translated
   sentence** — numbers arrive through placeholders.
5. No English text baked into images or icons.
6. Layouts accommodate roughly 30% text expansion; fixed-width labels and truncation that
   depends on English word length are avoided.
7. Directional icons (arrows, chevrons, back) are marked so they can mirror; semantic
   icons (search, calendar) are marked so they do not.
8. **A figure inside text is isolated** with `<bdi dir={figureDirection(value)}>`, so a sign,
   a percent sign or a currency code keeps its place in an Arabic sentence.
9. **Charts mirror explicitly, never by inheritance.** The SVG surface is always LTR (an
   inherited RTL direction flips `text-anchor`); Arabic reverses the time axis and puts the
   value axis on the right.
10. **Arabic sets no letter-spacing.** Tracking breaks the joins between Arabic letters, so
    `tracking-*` is neutralised under `html[lang='ar']`.
11. **Counted nouns use plural objects**, never `count === 1 ? … : …`. Arabic has six forms.

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
