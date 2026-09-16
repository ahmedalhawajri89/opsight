# Opsight — Security Strategy

Phase 00 document. **Nothing here is implemented in this phase.** This is the strategy that
Phase 01 onward implements and that the test suite enforces.

---

## 1. Threat model

An internal business system, authenticated-only, holding commercially sensitive data:
margins, costs, customer lists and financials. The realistic threats, in order of likelihood:

| # | Threat | Primary control |
| --- | --- | --- |
| 1 | **A legitimate user seeing data their role forbids** — Staff reading costs and margins | Server-side field redaction (§4) |
| 2 | Direct object reference — guessing `/orders/941` | Policy on every bound model (§5) |
| 3 | Credential attack — brute force, stuffing | Rate limiting, lockout, uniform errors (§7) |
| 4 | Session theft via XSS | HttpOnly cookies, no token in JS-readable storage, React escaping (§3) |
| 5 | CSRF from another origin | Sanctum CSRF, SameSite, origin allowlist (§3) |
| 6 | Mass assignment — posting `role` or `cost` into an update | Explicit `$fillable`, `validated()` only (§6) |
| 7 | Injection via filter/sort parameters | Allowlists, parameter binding (§8) |
| 8 | Bulk exfiltration through export | Export abilities, rate limits, audit (§9) |
| 9 | Silent tampering with financial records | Append-only ledgers, audit log (§10) |
| 10 | Secret leakage into version control | `.gitignore`, `.env.example`, pre-commit scan (§12) |

Threat 1 is first deliberately. In an internal BI tool, the most likely breach is not an
outside attacker — it is the system handing the wrong number to the wrong employee.

## 2. Principles

1. **Default deny.** No route is reachable without authentication except login and health.
   No action runs without an authorization check.
2. **The server is the only authority.** Frontend permission checks exist for usability.
   Every one is assumed bypassable and re-checked server-side.
3. **Absence over nulling.** A field a user may not see is **omitted from the response**,
   not sent as `null` and hidden. `null` still leaks the field's existence and invites a
   client-side "fix" that reveals it.
4. **Fail closed.** An unmapped ability, an unresolved policy or an unexpected state denies.
5. **Log the actor, never the secret.** Every write is attributed; no credential, token or
   session id is ever logged.
6. **One place per rule.** Each security rule has exactly one implementation site, so a new
   endpoint cannot miss it by omission.

## 3. Authentication

**Laravel Sanctum, SPA (stateful cookie) mode.** Full flow in ARCHITECTURE.md §3; ADR-002
records why token-in-JavaScript was rejected.

**Cookies.**

| Property | Value | Reason |
| --- | --- | --- |
| `HttpOnly` | true (session cookie) | XSS cannot read the session |
| `Secure` | true in production | No transmission over plaintext |
| `SameSite` | `Lax` | Blocks cross-site POST CSRF while keeping normal navigation working |
| `Domain` | `.opsight.test` / `.opsight.com` | Shared between the app and API subdomains |
| Lifetime | 8 hours, sliding | Long enough for a workday, short enough to matter |

`XSRF-TOKEN` is deliberately readable by JavaScript — it is the double-submit token and
carries no authority on its own.

**CSRF.** Enforced on every state-changing method. The SPA calls `/sanctum/csrf-cookie`
before its first unsafe request and sends `X-XSRF-TOKEN` thereafter.

**CORS.** Explicit origin allowlist from configuration, `supports_credentials: true`.
Wildcard origins are incompatible with credentialed requests and are never used. The
allowlist is environment-specific; production never includes a localhost origin.

**Passwords.** bcrypt (Laravel default), cost 12. Minimum 12 characters, checked against
Laravel's compromised-password list via `Password::defaults()`. No composition rules —
length and breach-checking outperform "one symbol required". No maximum length below 72
bytes, and no truncation surprises.

**Session rules.**

- Session id regenerates on login and on logout (fixation defence).
- `EnsureUserIsActive` middleware rejects a session whose user was deactivated mid-session,
  so revoking access is immediate rather than "at next login".
- Logout invalidates the session server-side and clears the query cache client-side.
- Concurrent sessions are permitted in the MVP. Session listing and remote revocation are
  Post-MVP.

**Not in the MVP:** two-factor authentication, SSO/OAuth, password reset by email
(Owner-set temporary passwords instead), remember-me. Each is deferred deliberately, not
overlooked. 2FA is the first to add when the system holds real data.

## 4. Authorization

Full matrix in ROLES_AND_PERMISSIONS.md. Security-relevant implementation rules:

**Abilities, not roles.** Code checks `$user->can('expenses.view')`. A role-name comparison
anywhere outside the single ability registry is a defect.

**Three enforcement layers, all required:**

1. **Route middleware** — coarse module gating (`can:expenses.view` on the expenses group).
2. **Policy** — per-model, per-action, including ownership (Staff may edit *their own*
   drafts). Every controller action calls `$this->authorize(...)`.
3. **API Resource** — field-level redaction (below).

**Field-level redaction.** The restricted fields are `products.cost`,
`order_items.unit_cost`, `orders.cogs_amount`, and every cost-derived metric.

```php
// ProductResource — the ONLY place products.cost is serialised
return [
    'id'    => $this->id,
    'sku'   => $this->sku,
    'name'  => $this->name,
    'price' => $this->price,
    $this->mergeWhen($request->user()->can('products.view_cost'), [
        'cost' => $this->cost,
    ]),
];
```

`mergeWhen` **omits the key entirely** when the ability is absent, satisfying §2.3. One
resource class per model means a newly added endpoint returning that model inherits the
redaction automatically — it cannot forget.

Cost-dependent metrics go further: for a cost-blind role they are **not calculated at all**,
so the value never exists in the process handling that request.

**Tested, not assumed.** A per-role API matrix test asserts the status code of every
endpoint for every role, and dedicated tests assert that restricted keys are **absent**
(`assertJsonMissingPath`) rather than null.

## 5. IDOR prevention

Route model binding proves a record exists. It proves nothing about permission.

**Rules:**

1. Every action that resolves a model authorizes it against a policy before touching it.
   No exceptions for "harmless" reads.
2. Nested resources verify the **parent relationship**:
   `POST /orders/{order}/items/{item}` must confirm `$item->order_id === $order->id`.
   Otherwise an item of another order can be manipulated through a permitted order's URL.
3. **Ownership checks are separate from ability checks.** `orders.update` says Staff may
   edit drafts; a second check says which drafts. Both must pass, in that order.
4. Where knowing a record exists is itself sensitive, the policy returns **404 rather than
   403**, so the API does not confirm the id.
5. Filter parameters referencing other records (`filter[customer_id]`) are validated for
   existence **and** visibility, so a filter cannot become an enumeration oracle.

Sequential integer ids are used (DATABASE_DESIGN.md §2) — which makes rule 1 the control,
not id opacity. Obscurity is not part of the model.

## 6. Mass assignment

1. Every model declares explicit `$fillable`. **`$guarded = []` is prohibited project-wide**
   and is a review-blocking issue.
2. Controllers pass `$request->validated()` to models — never `$request->all()`, never
   `$request->input()` wholesale.
3. Sensitive fields are **never fillable**: `users.role`, `users.is_active`,
   `orders.status`, `orders.placed_at`, `orders.cogs_amount`, `inventory_items.stock_on_hand`.
   Each is set only by the service that owns the operation, through an explicit assignment.
4. FormRequests differ by ability. A Staff-submitted product request does not accept `cost`
   at all — the rule set itself excludes it, so an extra field is rejected rather than
   ignored. A role that cannot read a field must not be able to write it
   (ROLES_AND_PERMISSIONS.md §3.2).
5. `$hidden` on models covers `password` and `remember_token` as a second layer, though
   API Resources are the primary control.

## 7. Rate limiting

| Scope | Limit | Rationale |
| --- | --- | --- |
| `POST /auth/login` | 5 / minute per IP **and** per email | Blocks both brute force on one account and spraying from one source |
| Authenticated API | 120 / minute per user | Generous for real use; caps runaway clients |
| Export endpoints | 10 / hour per user | Bulk extraction is the exfiltration vector |
| Analytics endpoints | 60 / minute per user | Aggregation is the most expensive work |
| Unauthenticated (health) | 30 / minute per IP | |

Additional:

- Progressive lockout after 10 failed logins for one email: 15-minute cooldown, logged as
  `auth.lockout` in `activity_logs`.
- **Login failures return an identical response for unknown email and wrong password** —
  same status, same message, same timing characteristics. Distinguishing them turns the
  login form into a user-enumeration endpoint.
- `429` responses include `Retry-After`.
- Rate limit state uses the cache store; in production that is a shared store so limits
  hold across application instances.

## 8. Input handling and injection

- **Every** write endpoint has a FormRequest. No `$request->input()` reaches a service
  unvalidated.
- Filter and sort parameters are **allowlisted per endpoint**. An unknown key returns 422
  rather than being ignored (ARCHITECTURE.md §4). Silent ignoring hides both bugs and probes.
- Column names never come from user input. A sort parameter maps through a fixed array to a
  column name; it is not interpolated.
- Raw SQL is avoided; where an aggregate requires it, every value is a bound parameter and
  the statement is reviewed.
- `LIKE` search values have `%` and `_` escaped, so a search for `%` is a literal search,
  not a full-table scan.
- Uploads are out of MVP scope. When they arrive: type allowlist by content inspection,
  size cap, randomised storage names, storage outside the web root, and no execution path.
- Responses are JSON with `Content-Type: application/json` and
  `X-Content-Type-Options: nosniff`. React escapes by default, and
  `dangerouslySetInnerHTML` is prohibited.

## 9. Export security

Export is the highest-value target in the system — one request can retrieve the entire
customer and margin picture.

1. Export requires a distinct `*.export` ability, separate from `view`. Seeing a page and
   extracting the dataset are different risks.
2. An export runs through the **same query scope, the same policies and the same resource
   redaction** as the screen. It is never a separate query path — a second path is a second
   place to forget a rule.
3. Row-capped (50,000 in the MVP) and rate-limited (§7).
4. Every export writes an `activity_logs` entry recording the resource, the filters and the
   row count.
5. Exports stream rather than buffering, so a large export cannot exhaust memory as a
   denial-of-service.
6. CSV injection defence: any cell beginning `=`, `+`, `-`, `@`, tab or CR is prefixed with
   a single quote, so an exported field cannot execute as a formula when opened in Excel.
7. Scheduled reports (Post-MVP) run **as the owning user**, with that user's redaction
   applied. A scheduled report must never run with elevated privileges, and a report whose
   owner is deactivated stops.

## 10. Audit logging

`activity_logs`, append-only. Schema in DATABASE_DESIGN.md §3.12.

**Logged:** every create, update and delete of source data (with a before/after diff of
changed attributes only); every order status transition with its reason; every inventory
adjustment; login success, failure and lockout; logout; every export with its filters;
every user creation, role change and deactivation; every settings change.

**Not logged:** ordinary list and detail reads. High volume, low value, and it would bury
the entries that matter.

**Never logged:** passwords (plain or hashed), session identifiers, Sanctum tokens, CSRF
tokens, `remember_token`. A central redaction key list is applied to every diff before
writing, and it is unit-tested with a case for each key.

**Integrity.** The application exposes no update or delete path for the table. In a
hardened deployment the application's database user is granted `INSERT` and `SELECT` only
on it, so tampering requires administrative access, which is itself auditable.

Retention: indefinite in the MVP. Monthly partitioning and archival are noted for when the
table grows large.

## 11. Sensitive data handling

| Data | Classification | Handling |
| --- | --- | --- |
| Passwords | Secret | bcrypt, never logged, never returned, never in a diff |
| Session cookies | Secret | HttpOnly, Secure, SameSite |
| Product cost, COGS, margin | Confidential | Ability-gated, omitted from responses (§4) |
| Financial aggregates | Confidential | Ability-gated |
| Customer PII (name, email, phone, address) | Confidential | Authenticated-only, export-gated, audited |
| Order data | Internal | Authenticated-only |
| Business settings | Internal | Owner-only write |

- No sensitive value appears in a URL — only in the body — so it cannot land in access logs,
  browser history or a `Referer` header.
- Error responses never expose SQL, file paths, stack traces or configuration. Unhandled
  errors return a reference id; the detail goes to the log.
- `APP_DEBUG=false` in every non-local environment. The Phase 01 deployment checklist
  includes verifying it.
- PII is not encrypted at rest at the column level in the MVP. Rationale: it would break
  search and sorting on exactly the columns the product needs to search and sort, for a
  threat (database file theft) better addressed by disk-level encryption and access control.
  Recorded as a conscious decision, with `customers.phone` and address noted as the first
  candidates should the requirement change.
- Backups inherit the same classification and require the same access control. Backup
  strategy is a deployment-phase deliverable.

## 12. Secrets and configuration

- `.env` is git-ignored — root, `backend/` and `frontend/` — and `.gitignore` was written
  in Phase 00 **before any application code exists**, precisely so a secret cannot be
  committed before the ignore rule arrives.
- `.env.example` is committed, with placeholder values only and no real credential.
- `APP_KEY` is generated per environment and never shared between them.
- Production secrets live in the deployment platform's secret store, not in a file in the
  repository.
- `NEXT_PUBLIC_*` variables are **public by definition** — embedded in the browser bundle.
  Only the API base URL and the application name are ever exposed this way. No key, no
  token, no identifier that grants anything.
- A pre-commit secret scan (gitleaks or equivalent) is part of the Phase 01 tooling setup.
- Any secret that does reach a commit is rotated, not merely removed — history is public
  once pushed.

## 13. Transport and headers

Production:

- HTTPS only, HTTP redirected, HSTS with a sensible max-age.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` — the application is never framed
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` denying camera, microphone and geolocation, none of which are used
- A Content-Security-Policy for the Next.js application, with `unsafe-inline` avoided
  wherever the framework permits. Tightening CSP is a deployment-phase task tracked
  explicitly, because a permissive CSP added "temporarily" tends to stay.

## 14. Dependency security

- `composer audit` and `npm audit` run in CI; a high-severity advisory fails the build.
- Lockfiles committed for both stacks; installs are reproducible.
- Dependencies are added deliberately and recorded with a justification
  (FRONTEND_ARCHITECTURE.md §12). A small dependency list is itself a security control.
- Framework patch updates applied promptly; majors on a reviewed schedule.

## 15. Security test requirements

Binding on Phase 01 onward:

1. Every endpoint, every role — an authorization matrix test asserting the expected status.
2. Unauthenticated access to every protected endpoint returns 401.
3. Restricted fields are **absent** from responses for cost-blind roles
   (`assertJsonMissingPath`, not `assertNull`).
4. A Staff user cannot edit another user's draft order (403).
5. A nested resource belonging to a different parent returns 404.
6. Mass assignment: posting `role`, `status`, `cogs_amount` or `stock_on_hand` to an update
   endpoint does not change them.
7. Login rate limit triggers at the configured threshold and returns 429 with `Retry-After`.
8. Unknown-email and wrong-password login responses are byte-identical.
9. A deactivated user's existing session is rejected on the next request.
10. An unknown filter or sort key returns 422, not a silently ignored parameter.
11. An export by a role without the `*.export` ability returns 403.
12. An export contains no column the requesting role may not see.
13. CSV cells beginning `=`, `+`, `-` or `@` are escaped in export output.
14. An `activity_logs` diff never contains a redaction-list key.
15. The last active Owner cannot be demoted or deactivated.
