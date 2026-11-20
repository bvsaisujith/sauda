# Sauda: Product Requirements Document

Status: Draft 2 | Date: 2026-11-20 | Owner: Sai Sujith

Related files: [payment-allocation.md](payment-allocation.md), [architecture.md](architecture.md), [sprint-plan.md](sprint-plan.md)

## 1. Overview

Sauda is an Android-first shop manager for wholesale and retail owners in India. It runs daily stock, sales bills, purchase bills, credit and debt, and reduces dead stock and stockouts through sales history, expiry risk, festival or seasonal notes and owner-approved purchase proposals.

The app is the product. Voice is a second front door onto the same operations, never a separate system.

### Problem

Kirana and retail shop owners lose ₹5,000–₹10,000 or more of stock each month through expiry, dead stock and poor reorder timing. They run out of fast-moving items because stock decisions come from memory, shelf checks and distributor visits. The owner has little usable data from the bills and UPI or khata records already available.

### Target users

- Kirana and wholesale shop owners
- Helpers and counter staff
- Customers buying on credit
- Suppliers and distributors
- Owners considering purchases with neighbouring shops later

### Goals

- Daily stock, sales, purchases, credit and payments work by touch.
- Voice calls the same operations as touch.
- No agent or voice command changes data until the owner approves a preview.
- Fast movers, slow movers, expiry risk and festival demand inform purchasing.
- Every wrong entry can be reversed without losing history.
- Purchases stay within an owner-set cash budget.

### Non-goals for v1

- GST filing, e-invoicing and tax reports
- Multi-shop or multi-branch operations
- Neighbouring-shop joint purchasing
- Payment gateway or UPI collection
- Barcode scanning and Bluetooth bill printing
- On-device voice models
- Languages other than English

## 2. Decisions

| Decision | Choice |
| --- | --- |
| Product name | Sauda |
| Language | English only for UI and speech |
| Purchase scope | Full purchasing: reorder suggestions, purchase drafts, purchase orders, supplier bills and stock receipts |
| Demand signals | Sales, festival/seasonal notes, expiry and dead-stock signals |
| Credit during purchasing | Ask before ordering: show customer receivables and supplier dues, never act silently |
| Party balances | Receivable and payable stay separate |
| Joint purchasing | Later |
| Mobile | React, Vite, Tailwind and Capacitor |
| Backend | Node, Express and TypeScript |
| Speech | Sarvam AI |
| LLM | OpenRouter, OpenAI-compatible API |
| Database | Postgres-compatible relational database |

## 3. Functional requirements

Every feature must work by touch alone. Voice only calls the same operations.

### 3.1 Items and stock

- Create items with unit, sell price, buy price, reorder level and optional expiry fields.
- Stock on hand is the sum of append-only movements.
- Low-stock and dead-stock views compare stock, sales velocity and expiry risk.
- Plain stock receipt, stock adjustment and reversal are available.

### 3.2 Parties

- One party profile can act as customer, supplier or both.
- Party profiles hold name, phone and area and can be imported from phone contacts.
- An existing profile can optionally be saved to phone contacts.
- Duplicate-name detection prevents ambiguous voice or touch actions.
- Customer receivables and supplier payables remain separate.

### 3.3 Sales bills

- Bill a customer with item, quantity and rate.
- Choose fully paid, partly paid or fully on credit.
- Store sales history for reorder and demand analysis.
- Saving reduces stock and adds a customer receivable for unpaid amounts.

### 3.4 Purchase bills and purchasing

- Bill a supplier or distributor with item, quantity, buy rate and supplier bill number.
- Choose fully paid, partly paid or fully on credit.
- Create a reorder proposal from sales velocity, stock, expiry risk and festival or seasonal notes.
- Restrict draft purchases to the owner-set cash budget.
- Show customer receivables and supplier payables as warnings before approval.
- Saving increases stock and adds supplier debt for unpaid amounts.
- Receiving stock without a supplier bill is allowed.

### 3.5 Reorder and demand intelligence

- Calculate item sales velocity from completed sales and stock movements.
- Identify fast movers, slow movers and dead stock.
- Allow owner-entered festival or local-demand notes.
- Flag expiry batches or expiry-risk items before loss.
- Explain every purchase suggestion with the signals used.
- Do not place or save an order until the owner approves.

### 3.6 Credit and debt

- Maintain separate receivable and payable ledger entries per party.
- Use FIFO allocations, named-bill allocations and advances for both directions.
- Treat purchasing approval as a separate warning and decision, not a silent netting of balances.

### 3.7 Payments

- Record money received from a customer or paid to a supplier.
- Support cash, UPI and bank modes.
- Preview allocations before approval.
- Reverse incorrect payments through exact reversing entries.

### 3.8 Corrections and audit

- No business record is hard-deleted.
- Bills, payments and proposals use cancelling or reversing entries.
- The audit log records actor, source touch or voice, operation and timestamp.

### 3.9 Reports

- Today's sales and purchases
- Stock value and low stock
- Dead stock and expiry-risk stock
- Fast movers and slow movers
- Who owes the shop and whom the shop owes
- Purchase budget used and remaining
- Overdue bills

## 4. Agent and voice layer

The touch app and voice agent call the same domain services through typed tools. Read tools run immediately. Write tools return proposals and never commit directly.

| Kind | Tools |
| --- | --- |
| Read | find_item, find_party, get_stock, get_party_balance, list_open_bills, sales_summary, purchase_summary, reorder_suggestions, expiry_risk, sales_velocity |
| Write | create_sales_bill, create_purchase_bill, receive_stock, record_payment, adjust_stock, add_party, add_item, create_purchase_draft |

Tool arguments use IDs. The agent resolves names and asks for one choice if two parties or items match. It reads quantities, amounts and purchase warnings back before approval.

A proposal expires after five minutes and cannot be committed twice.

## 5. Provider and Android settings

The owner can add an OpenAI-compatible provider and switch its model. Keys stay server-side.

The initial mobile delivery is React, Vite and Capacitor. Expo will be reconsidered later if Bluetooth printing or background sync becomes necessary.

## 6. Risks

- Fast-mover data may be incomplete: show uncertainty and the source signals.
- Speech may mishear quantities or party names: confirmation is mandatory.
- Expiry data may be missing: never claim a dead-stock or expiry conclusion without evidence.
- Customer and supplier balances may be out of date: show a warning before purchasing.
- Purchases may exceed the cash budget: proposal service refuses or warns according to owner policy.
- One party may appear as both customer and supplier: keep separate balances and let the owner choose the context.

## 7. Open questions

- Which information is required to create an expiry record: batch, quantity and date or item and date only?
- How far ahead of festivals should the first demand suggestion appear?
- Should the cash budget reset daily, weekly or per month?
- Should the owner reserve a percentage for regular supplier bills automatically?
- Should export to phone contacts be the default for new parties or an optional action?
