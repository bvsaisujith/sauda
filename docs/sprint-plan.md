# Sauda: Delivery Plan

Status: Draft 4 | Date: 2026-11-27 | Owner: Sai Sujith

Two gates: a working demo on **29 November 2026** and V1 complete on **15 December 2026**.

## Gate 1: 29 November demo

### Demo scope, nothing more

- Items, units, sell price, buy price, reorder level
- Stock batches, stock in, stock out, adjustments, current stock
- Customers and suppliers, orders, bills and payments
- Dashboard with today's sales, purchases and outstanding money
- English voice for those operations
- 22-language voice input through Sarvam, auto-detected
- Installable Android APK
- API and Postgres on the Oracle instance over HTTPS

GST, purchasing suggestions, repacking, credit ledgers and analytics are **not** in this gate.

### Order of work

1. Repository, workspaces, TypeScript, lint, CI, dependency-cruiser boundary rule
2. Prisma schema for shop, owner, device token, item, batch, stock movement, party, order, bill, payment, audit
3. Provider adapters and `.env.example`
4. Item and stock module services through `public.ts`
5. REST routes for items and stock
6. Touch shell, item screen, stock screen
7. Parties, orders, bills and payments, with the dashboard and history
8. Shared Zod tool registry and proposal/commit flow
9. Text agent loop against OpenRouter
10. Sarvam STT, English voice, read-back and approval
11. 22-language auto-detect and its tests
12. Capacitor Android build and APK signing
13. Oracle deployment, HTTPS, migrations, seed data
14. Demo script and fallback recording

### Demo definition of done

- A fresh APK installs on a phone that has never seen the app.
- Shop sign-up and sign-in work.
- The owner creates an item and sets its price by touch.
- The owner adds stock by touch.
- The owner adds a customer, creates an order and fulfils it, and the stock goes down.
- The owner records a payment and the bill closes when it is fully paid.
- The owner speaks an item and price instruction in English; the preview is read back and approved.
- The same instruction works in at least three non-English languages, and all 22 are accepted by the STT adapter.
- Stock on hand matches the movements after an approval and after a reversal.
- The API is reachable only over HTTPS with a valid device token.
- A recorded fallback demo exists in case the venue network fails.

## Gate 2: 15 December V1

### Added scope

- Parties with dual roles and contact import/export
- Sales bills, GST rate and HSN, CGST/SGST, credit sales
- Purchase bills, two-step purchasing and goods receipt
- Cash budgets with owner-set dates and audited overrides
- Reorder suggestions, 7- and 30-day velocity, festival notes, dead stock, expiry risk
- Repacking with pack items, partial splits, wastage and reversal
- Payments, FIFO allocation, advances and reversals
- Reports, audit, integration and security tests

### Delivered early (27 November 2026)

Parties with dual roles, orders with fulfilment and stock effect, bills with payments and
derived status, the dashboard and per-record history shipped ahead of Gate 1 on migration
`0004_orders_bills_payments`. The remaining V1 work is GST on bills, purchasing, demand and
repacking, and the FIFO payment allocation and advances described in `docs/payment-allocation.md`.

### Open follow-ups

| Issue | Work |
| --- | --- |
| #53 | Analytics screen (A12 / W5) |
| #54 | Settings screen: shop profile, theme, data export (A15 / W8) |
| #55 | In-app voice sheet and approval sheet (A13 / W7) |
| #56 | Browser tests for the order-to-payment flow |
| #57 | Pagination and server-side search on list routes |
| #58 | Party statement with bills and payments in date order |
| #59 | Live check of the 22 voice languages on a device |

### Order of work

1. Parties and ledgers
2. Sales and purchase bills with GST calculation
3. Payments and allocation
4. Purchasing: budget, draft/order, receipt, warnings
5. Demand: velocity, dead stock, expiry, festival notes
6. Repacking: model, service, touch screen, tools
7. Reports, GST summary, audit views
8. Agent tools for every new write
9. Voice coverage for purchasing and repacking writes
10. Integration tests, ARTEX security review, release build

### V1 definition of done

- Every core write works by touch.
- Every agent or voice write produces a preview and needs approval.
- GST totals reconcile to bill lines.
- Repack cost plus wastage reconciles to the consumed batches.
- Purchase receipt is the only path that raises stock and payables.
- Receivables and payables never net automatically.
- Payment edge cases pass the allocation tests.
- Every write is auditable and reversible.
- The APK runs against the Oracle deployment.

## Dependency pyramid

1. Monorepo, module boundaries and CI
2. Schema, append-only stock and FIFO
3. Module services through `public.ts`
4. REST and touch screens
5. Shared tools and proposals
6. Text agent
7. Voice and languages
8. Android and deployment
9. Billing, purchasing, repacking and reports

## Post-V1

Payment aggregators, GST filing and e-invoicing, joint purchasing, offline writes, barcode, Bluetooth printing, staff accounts and MCP.
