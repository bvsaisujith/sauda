# Sauda: Software Requirements Specification

Status: Draft 1 | Date: 2026-11-24 | Owner: Sai Sujith

Source documents: [PRD_1.md](PRD_1.md), [architecture.md](architecture.md),
[sprint-plan.md](sprint-plan.md), [payment-allocation.md](payment-allocation.md)

This SRS states what the system must do in testable terms. Each requirement has an ID, a
priority, and an acceptance statement. Priorities: **M** must for the 29 Nov demo gate,
**S** should for the 15 Dec V1 gate, **C** could after V1.

## 1. Scope

Sauda is an Android-first shop manager for Indian kirana and wholesale owners. The touch app
is the product. English voice is a second front door onto the same domain services. This SRS
covers the shop account, items and stock, voice input, and the platform rules that every
later module inherits. Sales bills, GST, purchasing, repacking and payments are specified
here only where they constrain the demo gate.

## 2. Users and actors

| Actor | Description |
| --- | --- |
| Shop owner | Registers a shop, signs in, and makes every purchasing and credit decision |
| Counter helper | Out of scope in v1; no accounts |
| Customer | Not a system actor; appears only as a party record after V1 |
| Supplier | Not a system actor; appears only as a party record after V1 |

## 3. Shop accounts and access

### FR-ACC-01 Shop registration — M

The system shall let a shop register with a shop name and a password.

Acceptance: a shop name of 1 to 80 trimmed characters and a password of 8 to 64 characters
containing at least one letter and one digit creates a shop and returns a device token. A
password failing any rule is rejected with a message naming the rule.

### FR-ACC-02 Password storage — M

The system shall store only a salted scrypt hash of the password.

Acceptance: the stored value starts with `scrypt$`, contains a per-shop random salt, and does
not contain the plain password. Two shops with the same password store different hashes.
Passwords never appear in logs, audit entries or API responses.

### FR-ACC-03 Shop name matching — M

The system shall match shop names ignoring case and leading or trailing spaces.

Acceptance: registering `Sri Lakshmi Kirana` then signing in with `  sri lakshmi kirana `
succeeds and returns the shop's own record. The owner still sees the name as first typed.

### FR-ACC-04 Unique shop names — M

The system shall refuse a second registration of the same shop name.

Acceptance: a duplicate shop name returns `409 shop-exists` with a message that points to
sign-in. The refusal is case-insensitive and ignores surrounding spaces.

### FR-ACC-05 Sign in — M

The system shall exchange a correct shop name and password for a device token.

Acceptance: correct credentials return `200` with a token, expiry, shop and owner id. The
token works on guarded routes and is rejected after expiry or revocation.

### FR-ACC-06 Non-disclosing failures — M

The system shall not reveal whether a shop name exists.

Acceptance: an unknown shop name and a known shop name with a wrong password return the same
status and the same message.

### FR-ACC-07 Sign-in throttling — M

The system shall lock a shop after five consecutive failed sign-ins.

Acceptance: the fifth failure locks the shop for fifteen minutes. Further attempts return
`423 locked` with `Retry-After`, including an attempt with the correct password. The lock is
per shop and survives across devices. Audit records the failure without the attempted value.

### FR-ACC-08 Device tokens — M

The system shall issue expiring, revocable device tokens.

Acceptance: tokens expire after `DEVICE_TOKEN_DAYS`. Logout revokes the presented token and
other tokens for the same shop keep working. Guarded routes return `401` without a valid
token.

### FR-ACC-09 Shop data isolation — M

The system shall keep each shop's records separate.

Acceptance: two registered shops receive different shop ids, and no read or write by one
shop's token returns or changes another shop's records. Every shop-scoped query filters on
the token's shop id.

### FR-ACC-10 Account screens — M

The touch app shall offer sign-in and create-account on one screen.

Acceptance: a two-tab control switches modes without losing the shop name. Create-account
shows a confirm-password field; sign-in does not. A show/hide control reveals the password.
Inline messages state the failing rule.

## 4. Items, units and prices

### FR-ITEM-01 Item record — M

An item shall hold name, base unit, optional pack size, sell price, buy price, reorder level,
GST rate, HSN code and a GST inclusive flag.

Acceptance: a created item round-trips every field. Name is unique per shop.

### FR-ITEM-02 Money and quantity precision — M

The system shall store money as whole paise and quantities as three-decimal values.

Acceptance: a price of ₹65.00 stores as `6500`. A quantity of 1.250 kg stores as `1.250`
and reads back unchanged.

### FR-ITEM-03 Touch edits are audited — M

Touch edits shall be written directly and audited; agent edits shall produce a proposal.

Acceptance: a touch edit creates one audit entry with actor, source `TOUCH`, operation and
before/after values. An agent edit creates no change until commit.

## 5. Stock

### FR-STK-01 Batches — M

Every receipt shall create a batch with quantity, buy rate and optional expiry date.

Acceptance: a receipt of 25 units at ₹52 creates a batch with `remaining = 25`. Stock without
an expiry date is allowed and is never described as expiring.

### FR-STK-02 Append-only movements — M

Stock on hand shall be derived from append-only movements, never from a stored balance.

Acceptance: movements exist for receipt, sale, adjustment, repack consume, repack produce and
reversal. No code path updates a stored balance. A reversal is a new reversing movement.

### FR-STK-03 FIFO valuation — S

Cost shall travel FIFO from the consumed batches.

Acceptance: a sale consumes the oldest open batch first; a repack moves the consumed unit cost
into the produced batch.

## 6. Voice and agent

### FR-VOICE-01 Transcription — M

The system shall accept a short audio clip and return text.

Acceptance: `POST /voice/transcribe` with a valid device token and a WAV, WebM, OGG, MP3,
M4A, FLAC or AIFF clip up to 6 MB returns the transcript, detected language and confidence.
Clips over 30 seconds are refused. Audio is never stored.

### FR-VOICE-02 Translation to English — M

The system shall return English text for speech in any of the 22 supported Indian languages.

Acceptance: with `mode=translate` and `language_code=unknown`, a Hindi, Tamil or Punjabi
command returns English text and the detected language code. The owner never picks a language.

### FR-VOICE-03 Read-back and approval — M

The system shall read back every proposed change and wait for owner approval.

Acceptance: a write proposal states item, quantity, rate and amount in English. No write
reaches the database before the owner approves. A low-confidence transcript asks the owner to
repeat rather than creating a proposal.

### FR-VOICE-04 Low confidence — M

The system shall ask the owner to repeat when confidence is low.

Acceptance: a confidence below the configured threshold produces one short question and no
proposal.

## 7. Corrections and audit

### FR-AUD-01 Append-only history — S

The system shall never hard-delete a business record.

Acceptance: cancellations and reversals create new rows. A delete attempt on a bill, payment
or movement fails or is unavailable.

### FR-AUD-02 Audit content — S

The audit shall record actor, source, operation, entity, before and after values and time.

Acceptance: every write in FR-ACC, FR-ITEM and FR-STK produces one audit entry with source
`TOUCH` or `VOICE`.

## 8. Non-functional requirements

### NFR-01 Platform

The system shall run as one Node and Express service on Node 22 or later, with Postgres
through `DATABASE_URL`. TypeScript strict mode applies across the workspace.

### NFR-02 Module boundaries

Each domain module shall expose only `modules/<name>/public.ts`.

Acceptance: `npm run boundaries` fails on any import of a module internal file, and Prisma
types never cross a module boundary.

### NFR-03 Quality gates

The pipeline shall run lint, typecheck, boundary checks, tests and builds.

Acceptance: `npm run check` passes locally and in CI. A TypeScript error, lint error, failing
test or deep import fails the pipeline.

### NFR-04 Secret handling

Secrets shall live in the environment only.

Acceptance: no key, password or connection string is committed. `.env` is ignored. Missing
provider credentials fail environment validation in production.

### NFR-05 Transport

The API shall be reachable only over HTTPS with a valid device token.

Acceptance: the health route answers over HTTPS without a token; every other route returns
`401` without one.

### NFR-06 Mobile shell

The touch app shall ship as an installable Android APK built by CI.

Acceptance: a signed debug APK installs on a phone and reaches the deployed API over HTTPS.
The APK is published as a CI artifact on every merge to the default branch.

## 9. Traceability

| Requirement | PRD section | Sprint item |
| --- | --- | --- |
| FR-ACC-01 to FR-ACC-10 | 4.1 | Gate 1, step 4 |
| FR-ITEM-01 to FR-ITEM-03 | 4.2 | Gate 1, steps 4 to 6 |
| FR-STK-01 to FR-STK-03 | 4.3 | Gate 1, steps 4 to 6 |
| FR-VOICE-01 to FR-VOICE-04 | 4.13 | Gate 1, steps 7 to 10 |
| FR-AUD-01 to FR-AUD-02 | 4.11 | V1, step 7 |
| NFR-01 to NFR-06 | 3, 6 | Gates 1 and 2 |

## 10. Open items

- Whether the owner may rename a shop after registration, and what happens to the login key.
- Whether sign-in lockout should also apply per device to stop one phone exhausting a shop.
- Password reset path, which needs a verified contact channel and is out of the demo gate.