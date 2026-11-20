# Sauda: Sprint 1 Plan

Status: Draft 2 | Date: 2026-11-20 | Owner: Sai Sujith

Sprint 1 runs 21–29 November 2026.

## Sprint goal

Deliver an Android-first touch app for item, stock, sales, purchase, party, credit and purchasing operations, with English voice on the same service and approval rules.

## Dependency pyramid

1. Monorepo, modular-monolith boundaries and CI
2. Database, append-only ledgers and domain services
3. REST API and touch workflows
4. Shared Zod tool registry and proposal/approval flow
5. OpenRouter text agent
6. Sarvam voice and read-back
7. Capacitor APK and testing release

## Must have

- Modular monolith monorepo
- Append-only stock movements
- Parties, including dual customer/supplier profiles
- Sales and purchase bills
- Receivable and payable ledgers
- FIFO, named-bill and advance payment allocation
- Stock and purchasing recommendations
- Festival and seasonal demand notes
- Sales velocity, expiry risk and dead-stock signals
- Cash-budgeted purchase proposals
- Credit/debt warnings before purchase approval
- Shared Zod tools and proposal/commit flow
- Text agent before voice
- English voice preview and approval
- Android APK through Capacitor
- Audit source touch or voice

## Later

- Neighbouring-shop joint purchasing
- MCP server
- Offline writes
- Barcode scanning
- Bluetooth printing
- Additional languages

## Definition of done

- Every core write works by touch.
- Agent and voice writes produce a preview and require approval.
- Purchase recommendations explain sales, stock, expiry and festival signals.
- Purchases cannot exceed a configured budget unless the owner explicitly approves the policy warning.
- Party receivables and payables remain separate.
- Payment edge cases pass the allocation tests.
- Every write is reversible and recorded in audit.
