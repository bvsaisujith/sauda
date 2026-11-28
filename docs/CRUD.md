# Sauda — CRUD and Implementation Guide

Companion to `sauda-ui-ux-spec.md`. This file says how each screen is built: data, API, business logic and UI behaviour.

Version: 2 — 26 Nov 2026

Status: parties, orders, fulfilment, bills, payments, dashboard and history are implemented
(`0004_orders_bills_payments` migration). Provider management, users/roles, analytics,
reorder and offline remain open.

Items marked **(proposed)** are my suggestions and are not yet confirmed by you.

---

## 1. Stack and architecture

| Layer | Choice | Source |
|---|---|---|
| Backend | TypeScript, Express, modular monolith | your decision |
| Frontend | React + Vite | your decision |
| Android | Capacitor wrapping the React app | your decision |
| Database | Postgres-compatible schema; plan to move to Supabase later | your decision |
| Speech-to-text | Sarvam AI | your decision |
| LLM | OpenRouter (OpenAI-compatible API) with provider/model switch | your decision |
| Language | English only | your decision |
| Validation | zod, schemas shared by frontend and backend | (proposed) |
| Data fetching | TanStack Query | (proposed) |
| Forms | React Hook Form + zod resolver | (proposed) |
| Styling | Tailwind with your palette tokens (light and dark) | your palette |

### 1.1 Repository layout
```
sauda/
  apps/
    api/                 Express modular monolith
      src/
        modules/
          auth/
          shop/
          items/         items + batches + stock movements
          parties/
          orders/
          bills/         bills + payments
          analytics/
          ai/            voice, proposals, providers
          audit/
        common/          errors, middleware, db, money utils
        server.ts
    web/                 React + Vite (web dashboard and Android UI)
      src/
        layouts/         MobileLayout (bottom bar), DesktopLayout (sidebar)
        pages/
        components/
        features/        one folder per module (api hooks + components)
        lib/
      capacitor.config.ts
  packages/
    shared/              zod schemas, types, status calculation
```
One React codebase, two layouts **(proposed)**: bottom bar and floating mic on small screens and in the Capacitor app; sidebar and top bar on desktop widths. This keeps the app and the dashboard in sync with less work.

### 1.1.1 What exists today

| Area | State |
|---|---|
| `auth` | Shop name + password, scrypt, device tokens, lockout |
| `items` | CRUD, archive, duplicate-name guard |
| `stock` | Append-only movements, FIFO batches, receive/adjust |
| `parties` | CRUD with receivable/payable derived from bills |
| `orders` | CRUD, fulfil, stock effect, difference-only edits |
| `bills` | Derived status, payments CRUD, reopen, recalculation |
| `audit` | Before/after history per record |
| `providers`, `ai`, `analytics` | Not built yet |

One React codebase, two layouts **(proposed)**: bottom bar and floating mic on small screens and in the Capacitor app; sidebar and top bar on desktop widths. This keeps the app and the dashboard in sync with less work.

### 1.2 Module rules
- Each backend module has `routes.ts`, `service.ts`, `repo.ts`, `schemas.ts`.
- Routes only parse input and call services. Services hold business rules. Repos run SQL.
- Modules talk through service functions, never through each other's tables. This keeps a later move off the monolith possible.
- All writes go through services that also write an audit log entry in the same database transaction.

---

## 2. API conventions

- Base path: `/api/v1`.
- JSON only. Dates in ISO 8601 UTC. The UI shows them in the user's local time.
- **Money is stored and sent as integer paise** (₹789.50 = 78950) to avoid rounding errors. **(proposed)**
- Quantities are decimals with 3 places (for kg, litres). **(proposed)**
- Auth: bearer token on every request **(proposed)**; shop scoping by `shop_id` on every row.
- List endpoints: `?page=1&pageSize=25&search=...&sort=...` and return `{ data, page, pageSize, total }`.
- Errors: `{ error: { code, message, fields? } }` with proper HTTP status (400 validation, 401, 403, 404, 409 conflict, 500).
- **Soft delete:** every deletable table has `deleted_at`. Delete sets it and logs it. Normal reads exclude deleted rows. **(proposed)**
- **Optimistic concurrency:** each editable row has `version`. Updates send the version; a mismatch returns 409 so two devices do not silently overwrite each other. **(proposed)**
- Edits are never blocked by business rules (your decision); validation only rejects malformed input (negative quantity, missing party, and so on).

---

## 3. Database schema (Postgres)

```sql
-- Tenancy and users
create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text, address text,
  cash_budget_paise bigint default 0,        -- used by reorder suggestions
  expiry_alert_days int default 14,
  created_at timestamptz default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops(id),
  name text not null,
  login text unique not null,
  password_hash text not null,
  role text not null default 'owner',        -- owner | staff (proposed)
  created_at timestamptz default now(),
  deleted_at timestamptz
);

-- Parties
create table parties (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  type text not null check (type in ('customer','supplier')),
  name text not null,
  phone text, address text, notes text,
  version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- Items and batches
create table items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  name text not null,
  category text,
  unit text not null,                        -- kg, pcs, pack, l ...
  selling_price_paise bigint default 0,
  cost_price_paise bigint default 0,
  quantity numeric(14,3) not null default 0,
  reorder_level numeric(14,3) default 0,
  track_expiry boolean default false,
  version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table batches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  quantity numeric(14,3) not null,
  expiry_date date,
  purchase_date date,
  deleted_at timestamptz
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  delta numeric(14,3) not null,              -- + in, - out
  reason text not null,                      -- order_fulfilled | manual | voice | reopen_reversal
  order_id uuid references orders(id),
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Orders
create table orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  type text not null check (type in ('customer','supplier')),
  party_id uuid not null references parties(id),
  order_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending','fulfilled')),
  total_paise bigint not null default 0,
  notes text,
  version int not null default 1,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity numeric(14,3) not null check (quantity > 0),
  rate_paise bigint not null check (rate_paise >= 0),
  line_total_paise bigint not null
);

-- Bills and payments
create table bills (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  order_id uuid not null unique references orders(id),
  bill_number text not null,
  total_paise bigint not null,               -- mirrors order total
  paid_paise bigint not null default 0,      -- sum of payments (kept in sync)
  status text not null default 'unpaid'
    check (status in ('unpaid','partial','paid')),
  closed boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id),
  amount_paise bigint not null check (amount_paise > 0),
  paid_on date not null default current_date,
  mode text,                                 -- cash | upi | ... (proposed)
  note text,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- Audit
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  entity_type text not null,                 -- order | bill | payment | item | party | provider | user ...
  entity_id uuid not null,
  action text not null,                      -- create | update | delete | status_change | reopen | approve | reject
  changes jsonb,                             -- { field: { old, new } }
  source text not null default 'manual',     -- manual | voice | agent
  user_id uuid references users(id),
  created_at timestamptz default now()
);
create index on activity_log (shop_id, created_at desc);
create index on activity_log (entity_type, entity_id);

-- AI
create table ai_providers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  name text not null,
  base_url text not null,
  api_key_encrypted text not null,
  is_active boolean default false,
  deleted_at timestamptz
);

create table ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references ai_providers(id),
  model_id text not null,                    -- e.g. an OpenRouter model slug
  label text,
  is_active boolean default false
);

create table ai_proposals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  kind text not null,                        -- stock_update | create_order | add_payment | reorder | ...
  transcript text,
  payload jsonb not null,                    -- the structured draft action
  preview jsonb not null,                    -- before -> after, human-readable lines
  status text not null default 'pending'
    check (status in ('pending','approved','edited','rejected','expired')),
  created_by uuid references users(id),
  decided_by uuid references users(id),
  created_at timestamptz default now(),
  decided_at timestamptz
);
```

Notes:
- `bills.paid_paise` and `bills.status` are always recomputed by one function (section 4.1), never set by hand.
- API keys are encrypted at rest and never returned by the API (only a masked value like `sk-…a1b2`).

---

## 4. Core business logic

### 4.1 Bill status calculation (shared package)
```ts
export function billStatus(total: number, paid: number) {
  if (paid <= 0) return "unpaid";
  if (paid < total) return "partial";
  return "paid";
}
```
`recalcBill(billId)` runs inside a transaction after any of: payment added, edited or deleted; order total edited; bill reopened. It:
1. Sums non-deleted payments into `paid_paise`.
2. Copies the order total into `total_paise`.
3. Sets `status` from `billStatus`.
4. Sets `closed = (status === 'paid')`.
5. Writes an audit entry if status changed.

Overpayment (paid greater than total) is allowed and treated as `paid`. No special handling (your decision).

### 4.2 Fulfilling an order
In one transaction:
1. Set order `status = 'fulfilled'`.
2. Create a `bills` row: bill number, total, `paid = 0`, status `unpaid`.
3. Stock effect **(proposed)**: for each line, customer order → `items.quantity -= qty`; supplier order → `items.quantity += qty`. Write a `stock_movements` row per line.
4. Write audit entries for the order and the bill.

### 4.3 Editing orders and bills
- Allowed while pending, and while the bill is unpaid or partial. Also allowed on a closed bill after it has been reopened.
- Editing the lines of a fulfilled order **(proposed)**: compute the difference between old and new quantities per item and apply only the difference to stock (and write movements). Then update the order total and run `recalcBill`.
- Every edit stores `{ field: { old, new } }` in the audit log.

### 4.4 Reopening a closed bill
- `POST /bills/:id/reopen` sets `closed = false`. Status stays as calculated (usually `paid`) until a payment or total changes.
- The reopen itself is logged. The warning dialog is shown by the UI before this call.
- If a payment edit makes the bill unpaid or partial, `recalcBill` sets `closed = false` automatically **(proposed)**, so the user does not have to press Reopen first. Pressing Reopen is the explicit route.

### 4.5 Audit service
```ts
audit.log({ shopId, userId, entityType, entityId, action, changes, source })
```
A single helper called by every service inside the same transaction as the write. A `diff(before, after)` util produces the `changes` object. Nothing writes to the tables without calling it.

### 4.6 Delete
Soft delete: set `deleted_at`, write audit entry. Deleting an order that has a bill: the bill is deleted too and any stock effect is reversed with a movement **(proposed)**. Deleting a payment recalculates the bill.

---

## 5. AI and voice pipeline

### 5.1 Flow
1. **Capture:** the mic button records audio in the React app (browser MediaRecorder; in Capacitor, the same plus the microphone permission in the Android manifest).
2. **Transcribe:** `POST /ai/transcribe` sends audio to Sarvam; returns text. English only.
3. **Interpret:** `POST /ai/interpret` sends the transcript plus a compact snapshot of context (item names, party names, open bills) to the active LLM through the OpenAI-compatible API, using tool/function calling with a fixed set of actions:
   - `update_stock(item, quantity, direction)`
   - `create_order(type, party, lines[])`
   - `add_payment(party_or_bill, amount)`
   - `answer_question(query)` **(proposed)**
4. **Propose:** the server validates the LLM output with zod, resolves names to IDs (fuzzy match; ambiguous names return a "which one?" choice), and stores an `ai_proposals` row with `payload` and a readable `preview`.
5. **Preview:** the UI shows the preview card and the server can return text for read-back (text-to-speech is a device feature; see open items).
6. **Decide:**
   - `POST /ai/proposals/:id/approve` runs the same service functions as manual actions, with `source = 'voice'`.
   - `PATCH /ai/proposals/:id` with edits, then approve.
   - `POST /ai/proposals/:id/reject`.
7. Pending proposals expire after a set time **(proposed: 24 hours)**.

The LLM never writes to the database. Only approval does, through the normal services.

### 5.2 Provider management
- Providers: name, base URL, API key. Models: list under each provider.
- One active model at a time (the model switch). The active provider and model are read on every interpret call, so switching needs no restart.
- Any OpenAI-compatible endpoint works through one client: `POST {base_url}/chat/completions`.
- "Test connection" button calls a tiny completion and reports success or the error.

### 5.3 Agent features (expiry, reorder, festival) **(proposed implementation)**
- A scheduled job (node-cron) runs daily and on demand.
- Expiry: batches whose `expiry_date` is within `expiry_alert_days`.
- Low stock: `quantity <= reorder_level`.
- Dead stock: no outgoing movement for N days (default 60).
- Reorder suggestions: for each low item, suggested quantity from recent sales rate; keep the total under `cash_budget_paise` by ranking on urgency.
- Festival demand: a small table of festival dates; items sold around the same festival last year, or multiplied by a configurable factor if there is no history.
- Output: rows in `ai_proposals` with `kind = 'reorder'`, so they use the same approve / edit / reject flow.

---

## 6. Screen-by-screen implementation

Status as of 27 Nov 2026: A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A14, A16, W1, W2, W3,
W4 and W6 are implemented on top of `0004_orders_bills_payments`. A12/A13/A15, W5, W7 and W8 are
still open.

For each screen: **route**, **API calls**, **CRUD**, **UI behaviour**, **validation and edge cases**.

### A1 / W1. Home / Dashboard
- **Route:** `/` (Home on mobile, Dashboard on desktop).
- **API:**
  - `GET /dashboard/summary` → today's sales and purchases, outstanding to receive, outstanding to pay, counts for expiring, low stock, pending approvals.
  - `GET /bills?status=...&sort=status_priority&page=...`
  - `GET /ai/highlights` (top expiry, low stock, reorder items).
- **Bill sort:** server-side order `unpaid (0), partial (1), paid (2)`, then `created_at desc`.
  ```sql
  order by case status when 'unpaid' then 0 when 'partial' then 1 else 2 end, created_at desc
  ```
- **CRUD:** Read only. Row tap navigates to Bill detail. Quick "Add payment" opens the payment sheet.
- **UI:** infinite scroll on mobile, pagination on desktop. Pull to refresh. Skeletons while loading. Empty state: "No bills yet. Create your first order."
- **Edge cases:** large counts shown as 99+; very long party names truncate.

### A2 / W6. Bill detail
- **Route:** `/bills/:id`
- **API:**
  - `GET /bills/:id` (includes order lines and payments)
  - `POST /bills/:id/payments` `{ amountPaise, paidOn, mode?, note? }`
  - `PATCH /payments/:id` `{ amountPaise?, paidOn?, mode?, note?, version }`
  - `DELETE /payments/:id`
  - `POST /bills/:id/reopen`
  - `GET /audit?entityType=bill&entityId=:id` (History tab)
- **CRUD:** payments are fully CRUD; the bill itself is changed only through its order or payments.
- **UI:**
  - Add payment: bottom sheet (mobile) or modal (desktop). Amount field defaults to the balance due, user can change it. Shows the new balance live before saving.
  - After save, the status chip and balance update from the server response, not locally, so they cannot drift.
  - Closed bill: payments list and fields are read-only; a prominent **Reopen** button. Tapping it shows a confirm dialog: "This bill is fully paid and closed. Reopen it to make changes?" with Cancel and Reopen.
  - Delete payment: confirm dialog.
- **Validation:** amount > 0, a valid date, a number. No upper limit (overpayment is allowed).
- **Edge cases:** two devices editing at once → 409 → show "This bill changed. Refresh to see the latest."

### A3 / W2. Orders list
- **Route:** `/orders?type=customer|supplier`
- **API:** `GET /orders?type=&status=pending&search=&page=`, `DELETE /orders/:id`
- **CRUD:** Read, Delete (menu). Create via the New order button.
- **UI:** toggle at top maps to the `type` query param and is remembered. Fulfilled orders filter available. Swipe to delete on mobile with confirm. Desktop table has filters, bulk fulfil and delete **(proposed)**.
- **Edge cases:** deleting a fulfilled order warns that its bill will be deleted too.

### A4. New / Edit order
- **Route:** `/orders/new?type=customer|supplier`, `/orders/:id/edit`
- **API:**
  - `POST /orders` `{ type, partyId, orderDate, notes, lines:[{itemId, quantity, ratePaise}], fulfil?: boolean }`
  - `PATCH /orders/:id` same shape plus `version`
  - `GET /items?search=` (item picker), `GET /parties?type=&search=` (party picker)
  - `POST /parties` inline create
- **CRUD:** Create, Update. Line items are replaced as a set on update (server diffs old and new for the audit log).
- **UI:**
  - Item picker with search; quantity and rate inputs; line total and order total update live (computed with integer maths).
  - Default rate: item `selling_price` for customer orders, `cost_price` for supplier orders; editable.
  - Buttons: **Save** (pending) and **Save & fulfil** (calls fulfil right after). Fulfil leads to the bill with the payment sheet offered.
  - Unsaved changes prompt when leaving.
- **Validation:** party required; at least one line; quantity > 0; rate ≥ 0.
- **Edge cases:** an item soft-deleted after being added shows as "removed item" but stays on the old order.

### A5. Order detail
- **Route:** `/orders/:id`
- **API:** `GET /orders/:id`, `POST /orders/:id/fulfil`, `DELETE /orders/:id`, audit history.
- **CRUD:** Read, Update (fulfil), Delete.
- **UI:** shows lines, totals, status. Actions depend on status: pending → Edit, Mark fulfilled, Delete; fulfilled → Edit, Open bill, Delete.

### A6 / W3. Stock list
- **Route:** `/stock?filter=all|low|expiring|dead|reorder`
- **API:** `GET /items?search=&filter=&page=`, `DELETE /items/:id`, `POST /items/:id/adjust`
- **Filter logic (server):**
  - low: `quantity <= reorder_level`
  - expiring: exists batch with `expiry_date <= today + expiry_alert_days`
  - dead: no outgoing `stock_movements` in N days (N default 60) **(proposed)**
  - reorder: items with an active pending `reorder` proposal
- **CRUD:** Read, Delete; quick adjust (Update).
- **UI:** filter chips with counts; badges on rows; Add item button. Desktop: inline edit, bulk edit, CSV import and export **(proposed)**.

### A7. Item detail
- **Route:** `/stock/:id`
- **API:** `GET /items/:id` (with batches), `GET /items/:id/movements`, `POST /items/:id/adjust { delta, reason }`, `POST /items/:id/batches`, `PATCH /batches/:id`, `DELETE /batches/:id`, `DELETE /items/:id`, audit history.
- **CRUD:** Read, Update, Delete; batches fully CRUD.
- **UI:** Adjust stock sheet (add or remove, reason). AI insights card from `/ai/highlights?itemId=`.

### A8. Add / Edit item
- **API:** `POST /items`, `PATCH /items/:id`
- **Fields and validation:** name required (unique per shop, case-insensitive **(proposed)**); unit required; prices ≥ 0; quantity ≥ 0 at creation (an opening quantity creates an `opening` movement); reorder level ≥ 0; if expiry tracking is on, batch expiry date required.
- **CRUD:** Create, Update.

### A9 / W4. Supplier / Customer list
- **Route:** `/parties?type=customer|supplier`
- **API:** `GET /parties?type=&search=&page=` (each row includes `outstandingPaise`), `DELETE /parties/:id`
- **Outstanding calculation:** sum of `total - paid` over the party's non-deleted bills.
- **CRUD:** Read, Delete; Create through Add.
- **Edge cases:** deleting a party with open bills warns and requires confirm; the party stays on old orders as "deleted party".

### A10. Party detail
- **Route:** `/parties/:id`
- **API:** `GET /parties/:id`, `GET /orders?partyId=`, `GET /bills?partyId=`, audit history.
- **UI:** balance summary, tabs for Orders and Bills, Call button (`tel:` link), New order shortcut (prefills party and type).

### A11. Add / Edit party
- **API:** `POST /parties`, `PATCH /parties/:id`
- **Validation:** name required; phone optional but must look like a phone number; type required.

### A12 / W5. Analytics
- **Route:** `/analytics?range=7d`
- **API:** `GET /analytics/overview?from=&to=`, `GET /analytics/top-items`, `GET /analytics/payment-split`, `GET /ai/insights`
- **CRUD:** Read. AI suggestions use approve, edit, skip (these call the proposal endpoints).
- **UI:** period selector; charts using the chart palette colours (`--chart-1` to `--chart-5`); AI insights section below the charts; export on desktop **(proposed)**.

### A13. Voice sheet and approval sheet
- **API:** `/ai/transcribe`, `/ai/interpret`, `/ai/proposals/:id/approve|reject`, `PATCH /ai/proposals/:id`
- **States:** idle → recording → transcribing → interpreting → preview → saved (or rejected, or error).
- **UI:** bottom sheet over any screen; the preview card shows lines like `Rice: 120 kg → 170 kg`. Approve is the primary button. If the model is unsure or a name is ambiguous, it asks a question with tappable choices.
- **Errors:** microphone permission denied, no speech detected, provider unreachable (offers manual entry).

### A14. History tab (all records)
- **API:** `GET /audit?entityType=&entityId=`
- **UI:** timeline; each entry: icon, action, "Price: ₹40 → ₹45", user, time, a voice badge when `source = voice`.

### A15. Settings **(proposed)**
- **API:** `GET/PATCH /shop`, `PATCH /me/preferences`
- **Fields:** shop name, phone, address, cash budget, expiry alert days, low-stock default, theme.
- **Theme:** `light | dark | system`, stored locally, applied by toggling the `dark` class on `<html>`.

### A16. Login and first-run **(proposed)**
- **API:** `POST /auth/login`, `POST /auth/logout`, `GET /me`
- **UI:** simple login; token kept in secure storage (Capacitor Preferences or secure-storage plugin).

### W7. Approvals page **(proposed)**
- **API:** `GET /ai/proposals?status=pending`, approve / edit / reject endpoints.
- **UI:** list with before/after preview; bulk approve.

### W8. Settings pages
| Page | API | CRUD |
|---|---|---|
| Shop Profile | `GET/PATCH /shop` | Read, Update |
| Providers & Models | `GET/POST/PATCH/DELETE /ai/providers`, `POST/PATCH/DELETE /ai/providers/:id/models`, `POST /ai/providers/:id/test`, `POST /ai/active { providerId, modelId }` | Full CRUD, test, set active |
| Users & Roles | `GET/POST/PATCH/DELETE /users` | Full CRUD **(proposed)** |
| Activity Log | `GET /audit?userId=&entityType=&from=&to=&source=` | Read only |

**Providers form:** name, base URL, API key (password field; on edit shows masked, only sent if changed), models list with add and remove. Key is encrypted with a server secret before saving.

---

## 7. Frontend implementation notes

### 7.1 Routing
React Router. Mobile tabs: `/` , `/orders`, `/stock`, `/parties`, `/analytics`. Nested routes for detail screens. The floating mic is rendered once in the layout, above the bottom bar.

### 7.2 State and caching
- TanStack Query for server data; query keys by resource (`['orders', type, filters]`).
- After any mutation, invalidate related keys (an order fulfilled invalidates orders, bills, items, dashboard).
- No local copy of derived values (status, balance, outstanding). Always use what the server returns.

### 7.3 Theme implementation
Use your CSS variables as given. Toggle `.dark` on `<html>`. Status chips use `--destructive` (unpaid), `--accent` (partial), `--primary` (paid).

### 7.4 Components to build once and reuse
`BillRow`, `OrderRow`, `ItemRow`, `PartyRow`, `StatusChip`, `MoneyInput` (rupees in, paise out), `QuantityInput`, `ItemPicker`, `PartyPicker`, `PaymentSheet`, `ConfirmDialog` (used for delete and reopen warning), `HistoryTimeline`, `ProposalPreviewCard`, `VoiceSheet`, `EmptyState`, `Skeleton`.

### 7.5 Capacitor (Android)
- `npx cap add android`, build the Vite app, `npx cap sync`.
- Android permission: `RECORD_AUDIO` for the mic.
- Plugins **(proposed)**: Preferences (token and settings), Network (offline banner), Share (share bill) and Haptics.
- Back button: close sheets and dialogs first, then navigate back.
- Safe-area insets for the bottom bar and floating mic.

### 7.6 Offline **(proposed, later)**
Not in v1. Show an offline banner and disable writes. Revisit after the hackathon.

---

## 8. Testing checklist

- Bill status: unpaid → partial → paid → reopen → edit payment → status updates; overpayment treated as paid.
- Fulfilling an order creates exactly one bill; fulfilling twice is rejected or ignored.
- Editing a fulfilled order's lines changes stock by the difference only.
- Deleting a payment recalculates status; deleting an order removes its bill.
- Every write produces an audit entry with correct old → new values.
- Voice proposal approve applies exactly the previewed change; reject changes nothing.
- Concurrent edit returns 409.
- Home bills sort: unpaid, then partial, then paid.
- Dark and light themes render all screens without unreadable text.

---

## 9. Suggested build order (your sprint ends 29 Nov)

**P0 (must have for the demo)**
1. Auth, shop, items, parties.
2. Orders, fulfil, bills, payments, status calculation.
3. Voice: transcribe, interpret, preview, approve for stock update, create order and add payment.
4. Home with sorted bills, bottom bar, floating mic.
5. Audit log (History tab).

**P1**
6. Stock filters (low, expiring), expiry batches.
7. Analytics basics.
8. Providers and models CRUD with active model switch.
9. Reopen flow with warning.

**P2**
10. Reorder suggestions within cash budget, dead stock, festival planner.
11. Web-only extras: bulk actions, CSV, Users & Roles, exports.
12. Offline, push notifications.

---

## 10. Open items to confirm

1. Stock effect on fulfilment (customer reduces, supplier increases): confirm.
2. Deleting an order that has a bill: should the bill and stock effects be reversed automatically?
3. Do you want password login only, or a PIN for the app?
4. Roles: owner and staff, and what staff cannot do.
5. Payment modes list.
6. Read-back of the preview: use the Android text-to-speech engine, or a provider TTS?
7. Money in paise internally with rupee display: confirm.
8. One React codebase for both app and dashboard, or two separate frontends?