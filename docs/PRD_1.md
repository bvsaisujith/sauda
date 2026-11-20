# VoiceStock: Product Requirements Document

Status: Draft 2 | Date: 2026-11-20 | Owner: Sai Sujith

Related files: [payment-allocation.md](payment-allocation.md), [architecture.md](architecture.md), [sprint-plan.md](sprint-plan.md)

## 1. Overview

VoiceStock is an Android-first shop manager for wholesale and retail owners in India. It runs daily stock, sales bills, purchase bills, credit and debt, and lets the owner do any of it by speaking English, with every change previewed and approved before it is saved.

The app is the product. Voice is a second front door onto the same operations, never a separate system.

### Problem

Small shop owners track stock, udhaar (credit) and supplier dues in notebooks or memory. Typing into apps is slow in a busy shop.

### Target users

Owners and helpers of kirana, wholesale and small retail shops. Phone-first, often on low-end Android devices and patchy networks.

### Goals

- Daily stock, sales, purchases, credit and payments work fully by touch.
- Voice calls the same operations as touch, so there is one set of business rules.
- No voice command changes data until the owner approves a preview.
- Any wrong entry can be reversed without losing history.

### Non-goals for v1

- GST filing, e-invoicing and tax reports
- Multi-shop or multi-branch
- Payment gateway or UPI collection (payments are recorded, not processed)
- Barcode scanning and Bluetooth bill printing
- Languages other than English

## 2. Decisions so far

| Decision | Choice |
| --- | --- |
| Language | English only, for the UI and for speech |
| Purchase bills | In scope for Sprint 1, same priority as sales bills |
| Delivery model | One sprint, 21 to 29 Nov 2026 (see [sprint-plan.md](sprint-plan.md)) |
| Frontend | React + TypeScript + Vite, wrapped for Android with Capacitor |
| Backend | Node + Express + TypeScript |
| Repo | npm-workspaces monorepo |
| Speech | Sarvam AI speech-to-text |
| LLM | OpenRouter (OpenAI-compatible), with a provider-management screen |
| Database | Relational, Postgres-compatible schema, Supabase later |

## 3. Functional requirements

Every feature must work by touch alone. Voice only calls the same operations.

### 3.1 Items and stock

- Create items with unit, sell price, buy price and reorder level.
- Stock on hand is the sum of an append-only movement ledger (receive, sale, adjustment, return). It is never an edited number.
- Low-stock list.

### 3.2 Parties

- Customers and suppliers, each with name, phone and area. One party can be both.
- Duplicate-name detection, because voice will say "Ramesh" and there may be two.

### 3.3 Sales bills

- Bill to a customer with lines of item, quantity and rate.
- Payment mode at billing: fully paid, partly paid or fully on credit.
- Saving a sales bill reduces stock and, for the unpaid part, increases what the customer owes.

### 3.4 Purchase bills

- Bill from a supplier with lines of item, quantity, buy rate, supplier bill number and date.
- Payment mode at billing: fully paid, partly paid or fully on credit.
- Saving a purchase bill increases stock, optionally updates the item's buy price, and for the unpaid part increases what the shop owes the supplier.
- Receiving stock without a bill is allowed as a plain stock receipt.

### 3.5 Credit and debt

- A per-party ledger. Receivable is money a customer owes the shop. Payable is money the shop owes a supplier.
- Balance is always the sum of ledger entries, never an edited number.

### 3.6 Payments

- Record money received from a customer or paid to a supplier, with mode (cash, UPI, bank) and date.
- Partial payments are allocated to bills as described in [payment-allocation.md](payment-allocation.md). The same rules apply to customers and suppliers.

### 3.7 Corrections

- Nothing is deleted. A wrong bill or payment is cancelled with a reversing entry that keeps the audit trail.

### 3.8 Reports

- Today's sales and purchases
- Stock value and low stock
- Who owes me, and whom I owe
- Bills overdue by age

### 3.9 Audit log

Every change records who or what made it and its source (touch or voice).

## 4. Voice and AI agent layer

Voice and the AI agent call the same service functions as the touch UI, through typed tools. The agent reads freely but can only propose writes. Nothing is saved until the owner approves.

Flow: mic audio goes to the Express server, Sarvam turns it into English text, the LLM picks tools, a write tool returns a proposal, the app shows a preview card and reads it back aloud, and the owner says yes or taps Approve.

| Kind | Tools | Behaviour |
| --- | --- | --- |
| Read | `find_item`, `find_party`, `get_stock`, `get_party_balance`, `list_open_bills`, `sales_summary`, `purchase_summary` | Run immediately, no approval |
| Write | `create_sales_bill`, `create_purchase_bill`, `receive_stock`, `record_payment`, `adjust_stock`, `add_party`, `add_item` | Return a proposal with a diff. Commit only through approval |

### Agent rules

- Tool arguments use IDs. The agent first resolves "Ramesh" or "rice" with `find_party` and `find_item`, and asks the owner when there are several matches.
- Quantities, amounts and units are read back before approval.
- A proposal expires after 5 minutes and cannot be committed twice.
- Low-confidence speech or missing details trigger one short question, not a guess.
- All tools are defined once with Zod schemas, shared by REST validation and the LLM tool list.
- After the sprint, the tools are wrapped as an MCP server so other agents can operate the shop through the same functions.

### Example commands

| Owner says | Result |
| --- | --- |
| "Ramesh paid 2000" | Payment proposal, allocated oldest-first, preview lists affected bills |
| "Ramesh paid 1000 for bill 112" | Payment proposal against bill 112 only |
| "Sold 5 kg sugar to Anil on credit" | Credit sales bill proposal, stock reduced, Anil's balance increased |
| "Bought 10 bags rice from Sharma Traders, paid 3000" | Purchase bill proposal, stock increased, the rest added to what the shop owes Sharma |
| "Paid Sharma 5000" | Supplier payment proposal, allocated to the oldest purchase bills first |
| "How much does Suresh owe?" | Immediate spoken answer |

## 5. Provider settings

The owner can add any OpenAI-compatible provider with a name, base URL, API key and models, then switch the active model from settings. No code change or redeploy is needed. Keys stay on the server and are never sent back to the app in full.

## 6. Non-functional requirements

- Money is stored as whole paise, never as floating-point numbers.
- Runs on low-end Android phones, with large touch targets usable one-handed.
- Stock and ledger views stay readable offline. Offline writes come after the sprint.
- Target: under 5 seconds from the end of speech to the preview card.
- Every write path, touch or voice, goes through the same domain services and audit log.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Speech is misheard, giving the wrong quantity or amount | Read-back, preview, explicit approval, reversing entries |
| Two parties share a name | `find_party` asks which one before any proposal |
| Nine days is tight with purchase bills added | Touch core first, voice on top; cut features, never the approval step |
| A provider is down or rate-limited | Provider settings and model switch |
| Supplier and customer are the same person | One party record that can hold both a receivable and a payable |

## 8. Open questions

- Should a party's receivable and payable be netted against each other, or always shown separately? Default in this draft: shown separately.
- Should a purchase bill update the item's buy price automatically, or ask each time? Default in this draft: ask on the preview card.
