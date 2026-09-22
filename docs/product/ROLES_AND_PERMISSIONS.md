# Opsight — Roles & Authorization Boundaries

Phase 00 document. Nothing here is implemented yet.

---

## 1. Evaluating the proposed roles

The brief proposed Owner, Manager, Analyst, Staff. Each was assessed against a real
question: *does this role correspond to a distinct set of things a person is trusted with?*
A role that duplicates another is organizational noise and should be deleted, not shipped.

| Role | Verdict | Reasoning |
| --- | --- | --- |
| **Owner** | Keep | Only role trusted with user management, business settings and destructive actions. Distinct. |
| **Manager** | Keep | Runs daily operations with full financial visibility, but is not trusted to grant access or change who can see what. That separation is real and worth enforcing. |
| **Analyst** | Keep | Read-everything, write-nothing, export-freely. A genuinely different shape from every other role — it is the only one where the write set is empty and the read set is near-total. Also the correct shape for an external accountant or consultant. |
| **Staff** | Keep, **narrowed** | Front-line data entry. The important part is not what they can write but what they must **not read**: cost, margin, profit and expenses. This is the project's hardest authorization requirement and the reason field-level authorization exists. |

**Rejected additions.**

- *Viewer* — a read-only role with no financial access. Rejected: Analyst minus cost data
  is a permission flag, not a role. Adding it would create four near-identical read roles.
- *Super Admin* — rejected. Owner already holds every ability; a tier above it would have
  nothing to do.
- *Warehouse* — rejected for the MVP. With a single stock location and no purchase orders,
  it is Staff with the orders module hidden. Revisit alongside multi-warehouse (ADR-006).

**Result: four roles, fixed in code.** See ADR-003 for why roles are not stored as
database rows in the MVP.

## 2. Role definitions

### Owner

The person accountable for the business. Full authority, including over other users.
Every deployment has at least one and the system enforces that (MVP_SCOPE §6.10).

### Manager

Runs operations. Full operational and financial read/write, no authority over access
control or business settings, and cannot permanently destroy records.

### Analyst

Reads and exports everything financial and operational. Writes nothing. The safe role
for an accountant, consultant or part-time analyst.

### Staff

Enters orders and customers. Sees selling prices and stock levels because the job
requires them. **Never sees cost, margin, profit or expenses.**

## 3. Ability catalogue

Permissions are named `<module>.<ability>` and checked individually. Roles are a mapping
onto this set, not a hierarchy — "Manager inherits Staff" is deliberately avoided because
inheritance hides exactly the exceptions that matter.

Legend: **✓** granted · **—** denied · **own** limited to records the user created

### 3.1 Module access

| Ability | Owner | Manager | Analyst | Staff |
| --- | :---: | :---: | :---: | :---: |
| `dashboard.view` | ✓ | ✓ | ✓ | ✓ |
| `orders.view` | ✓ | ✓ | ✓ | ✓ |
| `customers.view` | ✓ | ✓ | ✓ | ✓ |
| `products.view` | ✓ | ✓ | ✓ | ✓ |
| `inventory.view` | ✓ | ✓ | ✓ | ✓ |
| `expenses.view` | ✓ | ✓ | ✓ | — |
| `analytics.view` | ✓ | ✓ | ✓ | — |
| `reports.view` | ✓ | ✓ | ✓ | — |
| `users.view` | ✓ | — | — | — |
| `activity.view` | ✓ | ✓ | — | — |
| `settings.view` | ✓ | — | — | — |

Staff are denied `analytics.view` entirely rather than served a cost-free subset. A
revenue-only analytics module is a separate product surface that would need its own
design and its own tests; withholding the module is the honest MVP answer. Staff keep
`dashboard.view` with a reduced tile set (§4).

### 3.2 Create

| Ability | Owner | Manager | Analyst | Staff |
| --- | :---: | :---: | :---: | :---: |
| `orders.create` | ✓ | ✓ | — | ✓ |
| `customers.create` | ✓ | ✓ | — | ✓ |
| `products.create` | ✓ | ✓ | — | — |
| `categories.create` | ✓ | ✓ | — | — |
| `inventory.adjust` | ✓ | ✓ | — | — |
| `expenses.create` | ✓ | ✓ | — | — |
| `users.create` | ✓ | — | — | — |

Staff cannot create products because product creation sets `cost`, a field they may not
read. A role must never be able to write a field it cannot read — it turns a write form
into an oracle for the hidden value.

### 3.3 Edit and state transitions

| Ability | Owner | Manager | Analyst | Staff |
| --- | :---: | :---: | :---: | :---: |
| `orders.update` (draft only) | ✓ | ✓ | — | own |
| `orders.confirm` | ✓ | ✓ | — | ✓ |
| `orders.fulfil` | ✓ | ✓ | — | ✓ |
| `orders.cancel` | ✓ | ✓ | — | — |
| `orders.refund` | ✓ | ✓ | — | — |
| `orders.record_payment` | ✓ | ✓ | — | ✓ |
| `customers.update` | ✓ | ✓ | — | ✓ |
| `products.update` | ✓ | ✓ | — | — |
| `expenses.update` | ✓ | ✓ | — | — |
| `users.update` | ✓ | — | — | — |
| `users.change_role` | ✓ | — | — | — |
| `settings.update` | ✓ | — | — | — |

- Staff may edit only **their own draft** orders. Once confirmed, an order is immutable
  for everyone (MVP_SCOPE §5).
- Cancel and refund are withheld from Staff because both reverse recognized revenue and
  move stock. They are supervisory actions.
- Recording a payment is granted to Staff: it is money coming in, taken at the till or
  brought back by a driver on cash on delivery. Money going back out stays under refund
  (ADR-022).

### 3.4 Delete

| Ability | Owner | Manager | Analyst | Staff |
| --- | :---: | :---: | :---: | :---: |
| `orders.delete` (draft only) | ✓ | ✓ | — | own |
| `customers.delete` (soft) | ✓ | ✓ | — | — |
| `products.deactivate` | ✓ | ✓ | — | — |
| `expenses.delete` | ✓ | ✓ | — | — |
| `users.deactivate` | ✓ | — | — | — |
| Hard delete of any record with history | — | — | — | — |

No role can hard-delete a record that participates in a metric. Deletion is deactivation
or soft-deletion; the row survives so that history does not change underneath a report.

### 3.5 Export

| Ability | Owner | Manager | Analyst | Staff |
| --- | :---: | :---: | :---: | :---: |
| `orders.export` | ✓ | ✓ | ✓ | — |
| `customers.export` | ✓ | ✓ | ✓ | — |
| `products.export` | ✓ | ✓ | ✓ | — |
| `inventory.export` | ✓ | ✓ | ✓ | — |
| `expenses.export` | ✓ | ✓ | ✓ | — |
| `analytics.export` | ✓ | ✓ | ✓ | — |
| `activity.export` | ✓ | — | — | — |

Staff have no export rights at all. Bulk extraction of customer and order data is a
different risk class from viewing one record on screen, and the front-line role has no
operational need for it.

**Export never widens access.** An export runs through the same query scope, the same
policies and the same field-level redaction as the screen it came from. An Analyst
exporting orders receives cost columns; the same export by a hypothetical cost-blind
role would not include those columns at all — not blank, absent.

### 3.6 Field-level abilities

These are the abilities that cannot be expressed as endpoint access. They gate
**individual fields inside responses that all roles can otherwise read.**

| Ability | Owner | Manager | Analyst | Staff | Gates |
| --- | :---: | :---: | :---: | :---: | --- |
| `products.view_cost` | ✓ | ✓ | ✓ | — | `products.cost`, `order_items.unit_cost` |
| `metrics.view_cost` | ✓ | ✓ | ✓ | — | COGS, Gross Profit, Gross Margin, Net Profit, Net Margin |
| `orders.view_margin` | ✓ | ✓ | ✓ | — | Per-order profit and margin |
| `customers.view_ltv` | ✓ | ✓ | ✓ | — | Customer lifetime value and lifetime profit |

Implementation requirement: enforced in the API Resource layer on the server. A hidden
field is **omitted from the JSON entirely**, not sent and hidden by CSS. The frontend
hides the same fields for usability, never for security. Every one of these has a
dedicated test asserting the key is absent from the response body (TESTING_STRATEGY.md).

## 4. What each role sees on the dashboard

| Tile / section | Owner | Manager | Analyst | Staff |
| --- | :---: | :---: | :---: | :---: |
| Net Revenue | ✓ | ✓ | ✓ | ✓ |
| Orders count | ✓ | ✓ | ✓ | ✓ |
| Average Order Value | ✓ | ✓ | ✓ | ✓ |
| New customers | ✓ | ✓ | ✓ | ✓ |
| COGS / Gross Profit / Gross Margin | ✓ | ✓ | ✓ | — |
| Operating Expenses / Net Profit / Net Margin | ✓ | ✓ | ✓ | — |
| Revenue trend chart | ✓ | ✓ | ✓ | ✓ |
| Profit trend chart | ✓ | ✓ | ✓ | — |
| Top products by revenue | ✓ | ✓ | ✓ | ✓ |
| Top products by profit | ✓ | ✓ | ✓ | — |
| Low-stock alerts | ✓ | ✓ | ✓ | ✓ |
| Cancellation rate | ✓ | ✓ | ✓ | ✓ |
| Insights feed | ✓ | ✓ | ✓ | cost-free rules only |

The dashboard endpoint returns a different **set of keys** per role. The client renders
what it receives and must not assume a fixed shape.

## 5. Authorization boundaries — implementation rules

These are binding on Phase 01 onward.

1. **Default deny.** A request with no matching policy is rejected. Nothing is public
   except the login endpoint and the health check.
2. **Server is the only authority.** Every ability is checked in the backend. The
   frontend receives an abilities list purely to decide what to render.
3. **Every controller action authorizes.** No action reaches a query without a
   `Gate`/Policy check first. Enforced by convention and covered by a per-role API matrix test.
4. **Ownership checks are separate from ability checks.** `orders.update` says Staff may
   edit drafts; a second check says *which* drafts. Both must pass.
5. **Route model binding is not authorization.** Resolving a model by id proves it exists,
   nothing more (see SECURITY.md, IDOR).
6. **Field redaction lives in API Resources**, in one place per model, so a new endpoint
   returning that model cannot accidentally leak the field.
7. **Abilities are data, roles are labels.** Code checks `can('expenses.view')`, never
   `role === 'manager'`. This keeps ADR-003's later move to database-backed roles a
   single-file change.
8. **The ability list is a single source of truth** — one PHP registry mapping role to
   abilities, exposed to the frontend on `/api/v1/me`. There is no second copy of this
   table in JavaScript.

## 6. Abilities payload contract

`GET /api/v1/me` returns the authenticated user with their resolved abilities:

```json
{
  "data": {
    "id": 4,
    "name": "Layla Hassan",
    "email": "layla@example.com",
    "role": "manager",
    "is_active": true,
    "abilities": [
      "dashboard.view", "orders.view", "orders.create", "orders.confirm",
      "expenses.view", "analytics.view", "products.view_cost", "metrics.view_cost"
    ]
  }
}
```

The frontend stores this list and exposes a `can(ability)` helper plus a `<Can>` gate
component (FRONTEND_ARCHITECTURE.md). Rendering decisions read that helper and nothing
else — no role-name comparisons in components.

## 7. Open questions for later phases

- Should Manager be able to view the activity log of an Owner's actions? Currently yes.
  If that becomes uncomfortable, the fix is a `activity.view_privileged` ability rather
  than a new role.
- Should a Staff member see the orders of other Staff? Currently yes, read-only. Narrowing
  this to own-only is a one-line scope change if a customer asks for it.
- Custom roles with an admin-editable ability matrix: deferred to ADR-003's revisit trigger.
