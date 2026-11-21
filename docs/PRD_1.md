# Sauda: Product Requirements Document

Status: Draft 3 | Date: 2026-11-21 | Owner: Sai Sujith

Related files: [architecture.md](architecture.md), [payment-allocation.md](payment-allocation.md), [sprint-plan.md](sprint-plan.md)

## 1. Overview

Sauda is an Android-first agentic shop manager for Indian kirana and wholesale owners. The touch app is the product. English voice is a second front door onto the same domain services, never a separate system. Voice input accepts 22 Indian languages; the interface and read-back stay English.

### Problem

Kirana and wholesale shops tie up ₹5,000–₹10,000 or more each month in expired and dead stock, then run out of fast-moving items because reorder decisions come from memory, shelf checks and distributor visits. The bills, khata entries and UPI records the shop already produces are not turned into decisions.

### Users

- The owner, who makes every purchasing and credit decision
- Counter helpers, when accounts are added after v1
- Customers buying on credit
- Suppliers and distributors
- Neighbouring shops, for joint buying after v1

### Goals

- Stock, prices, bills, purchases, credit and payments work by touch alone.
- Voice calls exactly the same operations as touch.
- No agent write changes data until the owner approves a preview.
- Stock decisions use sales history, expiry risk, dead stock and festival demand.
- Repacking bulk stock into retail packs keeps cost and quantity correct.
- Purchases stay inside an owner-defined cash budget, with an audited override.
- Every wrong entry is reversible without losing history.

## 2. Release gates

### 2.1 Demo gate: 29 November 2026

Only these must work, end to end, on a real Android phone against the Oracle deployment:

| Area | Required |
| --- | --- |
| Items and prices | Create, edit and find items with unit, sell price, buy price and reorder level |
| Stock | Batches, stock in, stock out, adjustments and current stock by item |
| English voice | Speak a stock or price instruction, see the preview, approve it |
| 22-language voice | The same flows spoken in any of 22 Indian languages, auto-detected by Sarvam |
| Android APK | Installable Capacitor build pointing at the deployed API |
| Oracle deployment | API and Postgres running on the owner's Oracle instance over HTTPS |

Everything else is out of the demo gate. If a demo-gate item is at risk, it wins over any 15 December item.

### 2.2 V1 gate: 15 December 2026

The demo gate plus:

- Parties with dual customer/supplier roles and phone contact import/export
- Sales bills with GST, CGST/SGST split and credit sales
- Purchase bills, two-step purchasing and supplier payables
- Reorder suggestions, cash budget, festival notes, dead stock and expiry risk
- Repacking with packs, partial splits, wastage and reversal
- Payments, FIFO allocation, advances and reversals
- Reports, audit and integration tests

### 2.3 After V1

Payment aggregators, GST filing and e-invoicing, neighbouring-shop joint buying, offline writes, barcode scanning, Bluetooth printing, staff accounts, MCP, additional UI languages.

## 3. Decisions

| Decision | Choice |
| --- | --- |
| Product name | Sauda |
| Architecture | Modular monolith, one deployable API |
| Module access | Each module exposes `public.ts`; deeper imports fail CI |
| Shop and accounts | One shop, one owner account, PIN plus device token |
| UI language | English only |
| Voice input | 22 Indian languages, Sarvam auto-detect |
| Purchase flow | Draft or purchase order, then goods receipt |
| Stock and payable timing | Stock and supplier payable are created at receipt, not at order |
| Cash budget | Owner sets a start and an end date |
| Over-budget | Warn; owner approves with a written reason; reason audited |
| Stock valuation | FIFO in the backend; summaries adjust across all batches on hand |
| Expiry | Per batch |
| Dead stock | Owner-set days without a sale |
| Sales velocity | Both 7-day and 30-day windows |
| Festival lead time | Owner-set days before the festival |
| Credit before purchase | Show supplier dues, receivables, overdue and budget remaining; never net automatically |
| GST | Rate and HSN per item, per-item tax-inclusive or exclusive, CGST and SGST only |
| GST filing | Out of scope |
| Shop header on bill | Out of scope in V1 |
| Repacking | Base item plus pack items, one shared stock pool, partial and repeatable |
| Repack wastage | Recorded with a reason |
| Repack reversal | Allowed while packs are unsold |
| Mobile | React, Vite, Tailwind, Capacitor |
| Backend | Node, Express, TypeScript |
| Database | Postgres through `DATABASE_URL` |
| ORM | Prisma |
| Speech | Sarvam through env configuration |
| LLM | OpenRouter through env configuration |
| Hosting | Owner's Oracle instance for the demo, containers later |

## 4. Functional requirements

### 4.1 Owner access

- First run sets a PIN on the device.
- The device receives a token; the PIN is required again after the configured lock period.
- The token can be revoked from the server.
- No customer, helper or public accounts in v1.

### 4.2 Items, units and prices

- Item holds name, base unit, optional pack size, sell price, buy price and reorder level.
- GST rate and HSN code are stored per item.
- Each item declares whether its sell price includes GST or excludes it.
- Duplicate-name detection prevents ambiguous voice actions.
- Price changes require a preview when made through the agent; touch edits are direct but audited.

### 4.3 Stock

- Every receipt is a batch with quantity, buy rate and optional expiry date.
- Stock on hand is the sum of append-only movements, never a stored balance.
- Movements: receipt, sale, adjustment, repack consume, repack produce, reversal.
- Value is FIFO: each batch carries its own rate; summaries adjust across all batches on hand.
- Stock without an expiry date is allowed and is never described as expiring.

### 4.4 Repacking

- A base item may have pack items, for example Rice 1 kg, Rice 5 kg and Rice 10 kg.
- Base and pack items draw from one shared stock pool.
- A repack consumes base quantity and produces pack quantity.
- Partial repacks are allowed; the remaining base stock stays loose and can be sold or repacked later.
- Wastage is recorded as consumed quantity minus packed quantity, with a reason.
- Cost travels FIFO from the consumed batches into the pack batches.
- A repack can be reversed while the pack batches are unsold.
- Pack items carry their own sell price.

### 4.5 Parties

- One profile may be a customer, a supplier or both.
- Receivable and payable balances stay separate even on one profile.
- Phone contacts can be imported; an existing party can be saved back to contacts.
- Name ambiguity forces a choice; the agent never guesses.

### 4.6 Sales bills and GST

- Bill lines hold item, quantity, rate and discount.
- Tax is calculated per line from the item rate and the inclusive/exclusive flag.
- Tax is split into CGST and SGST only.
- Bill states: fully paid, partly paid, fully on credit.
- Saving a bill reduces stock FIFO, records tax and creates a receivable for any unpaid amount.
- Bills are numbered sequentially per shop and are never hard-deleted.
- A GST summary report totals taxable value, CGST and SGST for a period.

### 4.7 Purchases and purchasing

- A purchase bill records supplier, lines, buy rates and the supplier bill number.
- Receiving stock without a supplier bill is allowed.
- Two-step purchasing: create a draft or purchase order, then receive goods.
- Receipt is what raises stock and the supplier payable.
- Reorder suggestions combine stock, 7-day and 30-day velocity, expiry risk, dead stock and festival notes.
- Every suggestion explains the signals it used.
- Drafts are limited by the budget active on the draft date.
- Over-budget drafts require an owner reason before approval.

### 4.8 Demand, expiry and dead stock

- Velocity uses both 7-day and 30-day completed sales.
- Dead stock is stock with no sale for the owner-set number of days.
- Expiry risk comes from batch expiry dates, never from assumption.
- Festival notes are owner-entered with a date range and the owner-set lead time.
- No suggestion claims evidence that the data does not contain.

### 4.9 Credit and warnings

- The pre-purchase panel shows the chosen supplier's dues, total receivables, overdue receivables and budget remaining.
- A warning is information for the owner, not an automatic block and never a netting of balances.
- Purchase approval is a separate decision from customer credit.

### 4.10 Payments

- Record money received from a customer or paid to a supplier.
- Modes: cash, UPI, bank.
- Allocation follows [payment-allocation.md](payment-allocation.md): named bill, then FIFO, then advance.
- Every payment is reversible by an exact reversing entry.

### 4.11 Corrections and audit

- No business record is hard-deleted.
- Cancellations and reversals create new entries.
- Audit stores actor, source (touch or voice), operation, before and after values, and timestamp.

### 4.12 Reports

- Today's sales and purchases
- Stock value, low stock, dead stock and expiry risk
- Fast and slow movers
- Receivables, payables and overdue bills
- Purchase budget used and remaining
- GST summary for a period

### 4.13 Voice and agent

- Read tools run immediately and return IDs and evidence.
- Write tools return a proposal and never commit.
- Only the commit endpoint changes data.
- Proposals expire after five minutes and commit once.
- Quantities, amounts and warnings are read back before approval.
- Voice input accepts 22 Indian languages; the owner does not pick a language per command.
- Read-back and on-screen text remain English.

## 5. Tools

| Kind | Tools |
| --- | --- |
| Read | find_item, find_party, get_stock, get_party_balance, list_open_bills, sales_summary, purchase_summary, reorder_suggestions, expiry_risk, sales_velocity, get_budget, list_pack_items |
| Write | create_sales_bill, create_purchase_bill, receive_stock, record_payment, adjust_stock, add_party, add_item, create_purchase_draft, repack_stock, reverse_repack |

## 6. Provider configuration

Every outside dependency is configured by environment and reached through an adapter:

| Provider | Configuration |
| --- | --- |
| Database | `DATABASE_URL` |
| LLM | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` |
| Speech to text | `STT_BASE_URL`, `STT_API_KEY`, `STT_MODEL` |
| Payment aggregator | Not in V1; the adapter seam is reserved |

Switching a provider must not require code changes outside its adapter.

## 7. Architecture constraints

- One Express deployable containing the modules.
- A module is importable only through `modules/<name>/public.ts`.
- CI fails on a deep import.
- Prisma types never leave a module; callers receive DTOs.
- Zod contracts live in `packages/shared`.
- REST routes and agent tools both call module public functions.

## 8. Risks

- The 29 November demo covers only items, stock, voice, APK and deployment; any extra feature competes with those.
- Sarvam may mishear quantities or item names; read-back is mandatory.
- Expiry and dead-stock conclusions depend on recorded dates; missing data must be stated.
- FIFO plus repacking can drift if reversal is allowed after packs are sold; reversal is blocked in that case.
- One Oracle instance with 2 GB slows under load; the demo must stay within limited requests.
- A bill without shop name and GSTIN is not a valid tax invoice; this is a known V1 limitation.

## 9. Post-V1 roadmap

- Payment aggregator integration through a provider adapter, including Razorpay
- GST filing, e-invoice and GSTR exports
- Neighbouring-shop joint purchasing and settlement
- Offline writes with ordered sync
- Barcode scanning and Bluetooth printing
- Staff accounts and permissions
- MCP server over the same tools
- Additional UI languages

## 10. Open items to confirm before 15 December

These do not block the 29 November gate:

- Is HSN mandatory for every item that carries a GST rate?
- Should the shop GSTIN and name be stored but left off the printed bill, or omitted entirely?
- Rounding rule for bill totals and the round-off line.
- Composition-scheme shops: excluded, or a different bill layout?
- Can a pack item be sold as loose base quantity, or are packs and loose strictly separate?
- Maximum number of pack levels per base item.
