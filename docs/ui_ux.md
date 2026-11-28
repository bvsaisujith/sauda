# Sauda — UI/UX Screen Specification

Android app + web dashboard (`dash.sauda.thedeploymentlab.app`)
Version: 2 — 26 Nov 2026

Status: the screens below are the build order for the demo. Items, stock, parties,
orders, bills, payments, dashboard and history are implemented; voice, analytics,
reorder suggestions, providers, users and offline are still open.

Items marked **(proposed)** are my suggestion and have not been confirmed by you yet. Everything else comes from your decisions in this conversation.

---

## 1. Overview

Sauda is a voice-first stock, order and billing app for shop owners. Orders turn into bills when fulfilled. Payments are tracked per bill. Every action is logged. The AI (Sauda) never changes data without a preview and approval.

### 1.1 Platforms
| Platform | Navigation | Best for |
|---|---|---|
| Android app | Bottom bar (5 tabs) + floating mic button | Daily counter work: voice updates, new orders, payments |
| Web dashboard | Left sidebar + top bar (search, mic) | Desk work: bulk edits, reports, settings, admin |

### 1.2 Android bottom bar (5 tabs)
1. **Home**
2. **Orders**
3. **Stock**
4. **Supplier / Customer**
5. **Analytics**

A **floating mic button** sits above the bar on every screen.

### 1.3 Web sidebar
1. Dashboard (= Home)
2. Orders
3. Stock
4. Suppliers & Customers
5. Analytics
6. Settings → Shop Profile, Providers & Models, Users & Roles, Activity Log

Top bar: global search, mic, theme toggle, profile menu.

### 1.4 Themes and colours
Light and dark themes, using your palette. Font: Inter. Corner radius: 0.5rem.

| Token | Light | Dark |
|---|---|---|
| Background | `#faf7f0` | `#111827` |
| Card / surface | `#ffffff` | `#1f2937` |
| Text | `#1f2937` | `#f9fafb` |
| Primary (green) | `#1f7a4d` | `#22c55e` |
| Accent (amber) | `#f59e0b` | `#f59e0b` |
| Muted text | `#6b7280` | `#9ca3af` |
| Border | `#e5e7eb` | `#374151` |
| Destructive (red) | `#dc2626` | `#ef4444` |

**Status colour mapping (proposed):**
- Unpaid → destructive red
- Partially paid → accent amber
- Paid / closed → primary green

---

## 2. Data model (what each screen reads and writes)

| Entity | Key fields |
|---|---|
| **Item** | name, unit, category, selling price, cost price, current quantity, reorder level, expiry tracking on/off |
| **Batch** | item, quantity, expiry date, purchase date (for expiry tracking) |
| **Party** | type (customer or supplier), name, phone, address, notes |
| **Order** | type (customer or supplier), party, date, line items, total, status (pending, fulfilled), notes |
| **Order line** | item, quantity, rate, line total |
| **Bill** | generated from a fulfilled order; total, amount paid, balance, status (unpaid, partially paid, paid) |
| **Payment** | bill, amount, date, mode (cash, UPI, etc. **(proposed)**), note |
| **Activity log entry** | who, when, what changed (old → new), source (manual or voice) |
| **AI proposal** | draft change from voice or agent, preview, status (pending, approved, edited, rejected) |
| **Provider / Model** | name, base URL, API key, models (web only) |
| **User** | name, role, login |

---

## 3. Global behaviours

### 3.1 Order and bill lifecycle
1. User creates an order (customer or supplier). Status: **Pending**.
2. Pending orders are editable.
3. User marks the order **Fulfilled** → a **Bill** is generated and appears on Home.
4. Stock effect on fulfilment **(proposed)**: customer order reduces stock; supplier order increases stock.
5. Payments are added to the bill as separate entries.
6. Bill status is always calculated:
   - amount paid = 0 → **Unpaid**
   - 0 < amount paid < total → **Partially paid**
   - amount paid ≥ total → **Paid** (closed)
7. Everything stays editable until the bill is **Paid**.
8. A **Paid** (closed) bill is read-only but can be **reopened**. A warning dialog appears before reopening.

### 3.2 Edit rules
- Edits are never blocked.
- If an edit makes the total lower than the amount paid, the app takes no special action; the user handles it.
- Balance and status recalculate automatically after every edit.

### 3.3 Activity tracking
Every create, edit, delete, payment change, status change, reopen and AI approval writes a log entry (who, when, old → new). Entries are shown in each record's **History** tab and in the shop-wide **Activity Log**.

### 3.4 Voice and approval flow (floating mic)
1. User taps the mic and speaks (English only), for example "50 kg rice arrived from Ravi traders" or "customer paid 789".
2. Sauda shows a live transcript.
3. Sauda shows a **preview card** of what it understood (item, quantity, party, amount, what will change).
4. User chooses **Approve**, **Edit** or **Reject**. Sauda also reads the preview back aloud.
5. Only after Approve does the change save, and it is logged as a voice action.

### 3.5 Delete behaviour (proposed)
Delete is a soft delete: the record is hidden but kept, and the deletion is logged. A confirmation dialog appears first.

### 3.6 Common states on every screen
Loading skeleton, empty state with a clear action, error with retry, offline banner **(proposed)**.

---

## 4. Android screens

### A1. Home
**Purpose:** quick view of the shop and the bills that need attention.

**Contents (top to bottom):**
1. Store summary card: today's sales, today's purchases, total outstanding to receive, total outstanding to pay **(proposed)**.
2. AI highlights strip: expiring soon, low stock, reorder suggestions, upcoming festival. Each item taps through to the filtered Stock list or Analytics.
3. Pending approvals badge (AI proposals waiting).
4. **Bills list**, sorted: **Unpaid → Partially paid → Paid**. Within each group, newest first **(proposed)**.

**Bill row shows:** party name, bill number, date, total, balance due, status chip.

**Filters (proposed):** All, Customer bills, Supplier bills; search by party or bill number.

| CRUD | Behaviour |
|---|---|
| Create | Not here; bills are created from fulfilled orders |
| Read | Bills list and summary |
| Update | Tap a bill to open Bill detail (A2); quick "Add payment" action on a row **(proposed)** |
| Delete | Not here (done inside Bill detail) |

---

### A2. Bill detail
**Purpose:** see a bill, manage its payments, reopen if closed.

**Contents:**
- Header: bill number, party, date, status chip, total, paid, balance.
- Order summary: line items (tap to open the order).
- **Payments** list: each entry with amount, date, mode, note.
- **Add payment** button.
- **History** tab: activity log for this bill.

| CRUD | Behaviour |
|---|---|
| Create | **Add payment**: amount, date (default today), mode, note. Balance and status update immediately. |
| Read | Bill, payments, history |
| Update | Edit any payment (amount, date, mode, note); edit the underlying order. Status recalculates. |
| Delete | Delete a payment entry (with confirmation). Status recalculates. |

**Closed bills:** the screen is read-only with a **Reopen** button. Tapping it shows a warning ("This bill is fully paid and closed. Reopening lets you edit it. Continue?"). After confirming, the bill becomes editable and the reopen is logged.

**Voice:** "Customer paid 789" opens a payment preview for the matching bill.

---

### A3. Orders list
**Purpose:** see pending orders and start new ones.

**Contents:**
- Toggle at top: **Customer orders | Supplier orders**.
- **New order** button.
- List of **pending** orders (party, date, total, item count).
- Link or filter to view fulfilled orders (they also appear as bills on Home) **(proposed)**.
- Search by party.

| CRUD | Behaviour |
|---|---|
| Create | New order (A4) for the selected toggle (customer or supplier) |
| Read | Pending orders list; tap to open Order detail (A5) |
| Update | Open order and edit |
| Delete | Swipe or menu → delete (confirmation, soft delete, logged) |

---

### A4. New / Edit order
**Purpose:** build or change an order.

**Fields:**
- Type (fixed by the toggle: customer or supplier).
- Party (search or create new inline).
- Date (default today).
- Line items: pick item, quantity, rate (defaults from item price, editable). Line total calculated.
- Notes (optional).
- Order total (calculated).

**Actions:** Save as pending; Save and mark fulfilled; Cancel.

**How it works:**
- Adding items by search, by tapping from Stock, or by voice ("add 10 kg sugar").
- Saving as pending keeps it on the Orders list.
- Marking fulfilled generates the bill and sends the user to the bill detail with an **Add payment** prompt **(proposed)**.
- Editing an existing order opens the same form, pre-filled; changes are logged old → new.

| CRUD | Behaviour |
|---|---|
| Create | Save a new order |
| Read | Pre-filled form when editing |
| Update | Change party, items, quantities, rates, notes, date |
| Delete | Remove a line item; delete whole order from A5 |

---

### A5. Order detail
**Purpose:** view one order and act on it.

**Contents:** party, date, status, line items, total, notes; History tab.

**Actions:** Edit, Mark fulfilled (if pending), Delete, Open bill (if fulfilled).

| CRUD | Behaviour |
|---|---|
| Read | Full order and history |
| Update | Edit (A4), mark fulfilled |
| Delete | Delete with confirmation |

---

### A6. Stock list
**Purpose:** find items and see what needs attention.

**Contents:**
- Search bar.
- Filter chips: **All, Low stock, Expiring, Dead stock, Reorder suggested** (AI-driven filters).
- Item rows: name, quantity and unit, expiry badge, low-stock badge, AI badge when relevant.
- **Add item** button.

| CRUD | Behaviour |
|---|---|
| Create | Add item (A8) |
| Read | List with filters and search |
| Update | Tap to open Item detail (A7); quick quantity adjustment **(proposed)** |
| Delete | Menu → delete (confirmation, soft delete, logged) |

---

### A7. Item detail
**Contents:**
- Name, category, unit, prices, current quantity, reorder level.
- Batches with expiry dates (if expiry tracking is on).
- Stock movement history (orders in and out, manual adjustments, voice updates).
- AI insights for this item: reorder suggestion, dead-stock flag, festival demand note.
- History tab: activity log.

**Actions:** Edit item, Adjust stock (add or remove with reason), Update by voice, Delete.

| CRUD | Behaviour |
|---|---|
| Read | Details, batches, movement |
| Update | Edit details; adjust stock; edit or add batches |
| Delete | Delete item (confirmation, logged) |

---

### A8. Add / Edit item
**Fields:** name, category, unit, selling price, cost price, opening quantity, reorder level, expiry tracking toggle, batch (quantity and expiry date, if tracking is on).

| CRUD | Behaviour |
|---|---|
| Create | Save new item |
| Update | Save edits (logged old → new) |

---

### A9. Supplier / Customer list
**Contents:**
- Toggle: **Customers | Suppliers**.
- Search.
- Party rows: name, phone, outstanding balance (to receive from customers, to pay to suppliers).
- **Add** button.

| CRUD | Behaviour |
|---|---|
| Create | Add party (A11) |
| Read | List with balances |
| Update | Tap to open Party detail (A10) |
| Delete | Menu → delete (confirmation, soft delete, logged) |

---

### A10. Party detail
**Contents:**
- Name, phone, address, notes.
- Balance summary: total billed, total paid, outstanding.
- Orders and bills with this party (with status chips).
- History tab.

**Actions:** Edit, Call (phone intent), New order for this party, Add payment against an open bill **(proposed)**, Delete.

---

### A11. Add / Edit party
**Fields:** type (customer or supplier), name, phone, address, notes.

| CRUD | Behaviour |
|---|---|
| Create | Save new party |
| Update | Save edits (logged) |

Parties can also be created inline while building an order.

---

### A12. Analytics
**Purpose:** understand how the shop is doing and what the AI recommends.

**Contents:**
- Period selector (today, 7 days, 30 days, custom).
- Cards: sales, purchases, outstanding to receive, outstanding to pay.
- Charts: sales vs purchases over time, top-selling items, payment status split.
- **AI insights section:**
  - Expiry alerts.
  - Reorder suggestions within the cash budget, each with Approve, Edit or Skip.
  - Festival demand planner.
  - Dead stock list.

Read-only except for the AI suggestions, which follow the approval flow.

| CRUD | Behaviour |
|---|---|
| Read | All analytics |
| Update | Approve, edit or skip AI suggestions (creates draft orders **(proposed)**) |

---

### A13. Voice sheet and approval sheet (floating mic)
**Contents:** live transcript, preview card, Approve / Edit / Reject, spoken read-back.

**Supported voice actions (v1):**
- Stock arrived or sold ("50 kg rice arrived").
- Create an order ("new order for Ramesh, 5 kg sugar").
- Record a payment ("customer paid 789").
- Ask a question ("how much rice do I have?") **(proposed)**.

**Edit** opens the relevant form (order, payment or item) pre-filled with what Sauda understood.

---

### A14. Activity log (per record)
Shown as the **History** tab on orders, bills, items and parties. Each entry: action, old → new values, user, time, source (manual or voice).

---

### A15. Settings **(proposed)**
- Shop profile (name, address, phone).
- Theme (light, dark, follow system).
- Cash budget for reorder suggestions.
- Alert preferences (expiry window, low-stock threshold).
- Model switch (choose from providers set up on web).
- Account and logout.

---

### A16. Login and first-run **(proposed)**
Login, then a short setup: shop name, first items, first parties. Skippable.

---

## 5. Web dashboard pages

All pages share the same data and rules as the app. The web adds tables, bulk actions and admin.

### W1. Dashboard
Same content as Home, laid out in a grid: summary cards, AI highlights, approvals queue, bills table (same sort order), quick links.

### W2. Orders
- Tabs: Customer orders / Supplier orders.
- Table with filters (status, party, date range) and search.
- **New order** opens a side panel or page with the same form as A4.
- Bulk actions **(proposed)**: mark fulfilled, delete, export.
- Row click opens order detail with History.

### W3. Stock
- Table with the same filters (All, Low, Expiring, Dead stock, Reorder suggested).
- Add item, edit inline, bulk edit, import and export CSV **(proposed)**.
- Item detail page with batches, movement history and AI insights.

### W4. Suppliers & Customers
- Tabs for each, table with balances.
- Add, edit, delete.
- Party detail page with orders, bills, balance and history.

### W5. Analytics
Same as A12 with larger charts and export (CSV or PDF **(proposed)**).

### W6. Bills (reached from Dashboard)
Full table of bills with status filters, bill detail with payments (add, edit, delete), reopen with warning.

### W7. Approvals (AI proposals) **(proposed)**
Queue of pending voice and agent proposals with before/after preview and Approve, Edit, Reject.

### W8. Settings
| Page | CRUD |
|---|---|
| **Shop Profile** | Read, update |
| **Providers & Models** | Create, read, update, delete providers (name, base URL, API key, models); choose the active model |
| **Users & Roles** | Create, read, update, delete users; assign roles **(proposed)** |
| **Activity Log** | Read-only, filter by user, date, record type, source; export **(proposed)** |

---

## 6. Open items to confirm

1. Do Home bills include both customer bills and supplier bills (money to receive and money to pay), with a label on each?
2. Should fulfilling an order change stock automatically (customer order reduces stock, supplier order increases)?
3. Is there more than one user role (owner and staff), and what can staff not do?
4. Payment modes: cash and UPI only, or a longer list?
5. Should the web dashboard have a separate Bills page, or only show bills inside the Dashboard?
6. Do you want a login with a PIN or password on the app?
7. Offline support: should the app work without internet and sync later?