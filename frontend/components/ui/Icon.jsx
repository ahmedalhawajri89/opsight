/**
 * The icon set. One style, no dependency.
 *
 * Every glyph is a 24-unit outline drawn at a single 1.75 stroke in
 * `currentColor`, so an icon takes its tone from the text beside it and can
 * never introduce a colour of its own. A package would bring hundreds of glyphs
 * to use twenty, and a second visual dialect the first time someone reached for
 * one it did not have.
 *
 * Icons here SUPPORT recognition; they never carry meaning alone. Every use
 * sits beside a text label, so they are `aria-hidden` by default. Where an icon
 * genuinely stands alone (a menu button) the caller supplies `label`.
 */

const PATHS = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1" />
    </>
  ),
  orders: (
    <>
      <path d="M6 3.5h12a1 1 0 0 1 1 1v16l-2.5-1.5-2.25 1.5L12 19l-2.25 1.5L7.5 19 5 20.5v-16a1 1 0 0 1 1-1Z" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </>
  ),
  customers: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3 20c.6-3.3 3-5.5 6-5.5s5.4 2.2 6 5.5" />
      <path d="M15.5 5.3a3.5 3.5 0 0 1 0 6.4M17.5 14.9c1.8.8 3.1 2.6 3.5 5.1" />
    </>
  ),
  products: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  inventory: (
    <>
      <path d="M3.5 9 12 4l8.5 5v11.5h-17V9Z" />
      <path d="M7.5 20.5v-7h9v7M7.5 16.5h9" />
    </>
  ),
  expenses: (
    <>
      <rect x="3.5" y="6" width="17" height="13" rx="1.5" />
      <path d="M3.5 10h17M16 14.5h1.5" />
      <path d="M6.5 6V4.5h11V6" />
    </>
  ),
  analytics: <path d="M4 20.5h16M7 17v-5M12 17V7M17 17v-8" />,
  activity: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6" />
    </>
  ),
  settings: <path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M9 14.5v5" />,
  gallery: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.75v.25" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l2.75 1.75" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.2 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5V13.5M12 16.75V17" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.25 2.25 2.25 4.75-4.75" />
    </>
  ),
  bolt: <path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12l1-7Z" />,
  spark: (
    <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="2.75" />
      <path d="M4.5 6v12c0 1.5 3.4 2.75 7.5 2.75s7.5-1.25 7.5-2.75V6M4.5 12c0 1.5 3.4 2.75 7.5 2.75s7.5-1.25 7.5-2.75" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  signOut: (
    <>
      <path d="M14 4.5h4.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H14" />
      <path d="M10 8 6 12l4 4M6 12h10" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.2 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.2-3.5-8.5s1.2-6.2 3.5-8.5Z" />
    </>
  ),
  trendUp: <path d="M3.5 17 9.5 11l4 4 7-7.5M15 7.5h5.5V13" />,
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25v-17Z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </>
  ),
  cart: (
    <>
      <path d="M3.5 4.5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.3h7.9a1.5 1.5 0 0 0 1.5-1.2l1.4-6.8H6.4" />
      <circle cx="9.5" cy="19.5" r="1.25" />
      <circle cx="17" cy="19.5" r="1.25" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="9.5" cy="7" rx="5.5" ry="2.5" />
      <path d="M4 7v4c0 1.4 2.5 2.5 5.5 2.5S15 12.4 15 11V7" />
      <path d="M9 16.5c.9.9 2.9 1.5 5 1.5 3 0 5.5-1.1 5.5-2.5v-4c0-1.2-1.8-2.2-4.3-2.4" />
    </>
  ),
  percent: (
    <>
      <path d="M18.5 5.5 5.5 18.5" />
      <circle cx="7" cy="7" r="2.25" />
      <circle cx="17" cy="17" r="2.25" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5a2 2 0 0 1 2-2h11.5v3" />
      <path d="M4 7.5v10a2 2 0 0 0 2 2h14V8.5H6a2 2 0 0 1-2-1Z" />
      <path d="M16 14h1.5" />
    </>
  ),
  pie: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12V3.5Z" />
      <path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15V3.8Z" />
    </>
  ),
  box: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.25l8 4.5" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c.8-3.6 3.3-6 6.5-6 1.6 0 3 .6 4.1 1.6M18 14v6M15 17h6" />
    </>
  ),
  repeat: (
    <>
      <path d="M4.5 11V9.5a3 3 0 0 1 3-3h12M16.5 3.5l3 3-3 3" />
      <path d="M19.5 13v1.5a3 3 0 0 1-3 3h-12M7.5 20.5l-3-3 3-3" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </>
  ),
  undo: <path d="M9 14 4.5 9.5 9 5M4.5 9.5h10a5 5 0 0 1 0 10H11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  table: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  chevronDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  arrowUp: <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />,
  arrowDown: <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />,
  star: (
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  ),
  diamond: (
    <>
      <path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z" />
      <path d="M12 8.5 15.5 12 12 15.5 8.5 12 12 8.5Z" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />
      <path d="M9.5 20.5V14h5v6.5" />
    </>
  ),
  cube: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  userCircle: (
    <>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5.5 19.5c1-3 3.5-5 6.5-5s5.5 2 6.5 5" />
    </>
  ),
  pulse: <path d="M3.5 12h4l2.5-6 4 12 2.5-6h4" />,
  chart: (
    <>
      <path d="M4 20.5h16" />
      <rect x="5.5" y="12" width="3" height="6" rx="0.75" />
      <rect x="10.5" y="7" width="3" height="11" rx="0.75" />
      <rect x="15.5" y="10" width="3" height="8" rx="0.75" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
};

export function Icon({ name, size = 16, label, className, strokeWidth = 1.75 }) {
  const glyph = PATHS[name];

  if (!glyph) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {glyph}
    </svg>
  );
}
