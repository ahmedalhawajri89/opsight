# Opsight — frontend

The Next.js application. Read the [root README](../README.md) first; it explains
what Opsight is and how to run both halves together.

**JavaScript, not TypeScript.** That is a project-wide decision, not an
oversight, and nothing here should introduce `.ts`/`.tsx`.

## Running it

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL points at the API
npm run dev                  # http://localhost:3000
```

The API must be running on port 8010 (`cd ../backend && php artisan serve --port=8010`).
`npm` is the package manager for this project; `pnpm` and `yarn` are not used.

## Checks

```bash
npm run lint      # eslint, including the rule that forbids physical CSS sides
npm run test      # vitest — formatting, i18n parity, permissions, tokens
npm run build     # a production build, which the browser tests run against
npm run e2e       # Playwright, against a seeded API
```

The browser tests need the API running with demo data seeded
(`SEED_DEMO_DATA=true`), and they sign in as the seeded accounts.

## Where things live

| Path          | What it holds                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `app/`        | Routes. `(auth)` sign-in and sign-up, `(setup)` the onboarding wizard, `(app)` everything behind the shell |
| `components/` | Reusable interface: `ui/` primitives, `data/` tables and states, `layout/` the shell, `charts/`            |
| `features/`   | Feature modules — each owns its hooks, dialogs and logic                                                   |
| `services/`   | The only place that knows API paths                                                                        |
| `lib/`        | Formatting, i18n, query keys, permissions                                                                  |
| `e2e/`        | Playwright specs                                                                                           |

More detail in
[docs/architecture/FRONTEND_ARCHITECTURE.md](../docs/architecture/FRONTEND_ARCHITECTURE.md).
