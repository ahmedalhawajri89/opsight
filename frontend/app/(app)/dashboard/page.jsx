'use client';

import { useAuth } from '@/features/auth/AuthProvider';
import { Can } from '@/features/auth/Can';

/**
 * Phase 01 placeholder.
 *
 * Deliberately NOT a fake dashboard: there are no invented KPI tiles and no
 * placeholder charts, because there is no order or expense data to compute
 * them from yet. Real metrics arrive in Phase 04, computed from Phase 03's
 * records.
 *
 * What this page does prove is the part Phase 01 exists to prove: the session
 * reached the browser, the server resolved this user's abilities, and the UI
 * gates on them.
 */
export default function DashboardPage() {
  const { user, abilities } = useAuth();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[--color-text]">Dashboard</h1>
        <p className="mt-1 text-sm text-[--color-text-muted]">
          Signed in as {user.name} · {user.role_label}
        </p>
      </header>

      <section className="rounded-[--radius-md] border border-[--color-line] bg-[--color-surface] p-5">
        <h2 className="text-sm font-semibold text-[--color-text]">Phase 01 — walking skeleton</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[--color-text-muted]">
          Authentication works end to end: an HttpOnly session cookie, CSRF on every unsafe request,
          and abilities resolved server-side. Operational modules arrive in Phase 03 and business
          metrics in Phase 04.
        </p>
      </section>

      <section className="rounded-[--radius-md] border border-[--color-line] bg-[--color-surface] p-5">
        <h2 className="text-sm font-semibold text-[--color-text]">Ability-gated rendering</h2>

        <div className="mt-3 space-y-2 text-sm">
          <Can
            ability="metrics.view_cost"
            fallback={
              <p className="text-[--color-text-muted]">
                Cost and margin figures are not available for your role. The server omits these
                fields entirely — they are not hidden in the browser.
              </p>
            }
          >
            <p className="text-[--color-positive]">
              Your role can see cost, margin and profit figures.
            </p>
          </Can>

          <Can ability="users.create">
            <p className="text-[--color-text-muted]">Your role can manage users.</p>
          </Can>
        </div>
      </section>

      <section className="rounded-[--radius-md] border border-[--color-line] bg-[--color-surface] p-5">
        <h2 className="text-sm font-semibold text-[--color-text]">
          Resolved abilities
          <span className="ms-2 font-normal text-[--color-text-subtle] tabular">
            ({abilities.length})
          </span>
        </h2>

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {abilities.map((ability) => (
            <li
              key={ability}
              className="rounded-[--radius-sm] border border-[--color-line] bg-[--color-surface-sunken] px-2 py-1 font-mono text-[0.6875rem] text-[--color-text-muted]"
            >
              {ability}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
