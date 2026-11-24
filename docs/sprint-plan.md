# Sauda: Delivery Plan

Status: Draft 3 | Date: 2026-11-21 | Owner: Sai Sujith

Two gates: a working demo on **29 November 2026** and V1 complete on **15 December 2026**.

## Gate 1: 29 November demo

### Demo scope, nothing more

- Items, units, sell price, buy price, reorder level
- Stock batches, stock in, stock out, adjustments, current stock
- English voice for those operations
- 22-language voice input through Sarvam, auto-detected
- Installable Android APK
- API and Postgres on the Oracle instance over HTTPS

Sales bills, purchase bills, parties, GST, purchasing suggestions, repacking and payments are **not** in this gate.

### Order of work

1. Repository, workspaces, TypeScript, lint, CI, dependency-cruiser boundary rule
2. Prisma schema for shop, owner, device token, item, batch, stock movement, audit
3. Provider adapters and `.env.example`
4. Item and stock module services through `public.ts`
5. REST routes for items and stock
6. Touch shell, item screen, stock screen
7. Shared Zod tool registry and proposal/commit flow
8. Text agent loop against OpenRouter
9. Sarvam STT, English voice, read-back and approval
10. 22-language auto-detect and its tests
11. Capacitor Android build and APK signing
12. Oracle deployment, HTTPS, migrations, seed data
13. Demo script and fallback recording

### Demo definition of done

- A fresh APK installs on a phone that has never seen the app.
- Shop sign-up and sign-in work.
- The owner creates an item and sets its price by touch.
- The owner adds stock by touch.
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
