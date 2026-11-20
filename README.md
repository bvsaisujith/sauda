# Sauda

Sauda is an Android-first agentic shop manager for Indian kirana and wholesale retail owners.

The product is touch-first: owners manage items, stock, sales bills, purchase bills, parties,
payments and credit/debt from the app. English voice is a second front door onto the same
business operations. Voice and text agent writes always produce a preview proposal first; no
data changes until the owner approves it.

Sauda also helps reduce dead stock and stockouts using sales history, expiry risk, festival and
seasonal demand signals, and an owner-set purchasing cash budget. Purchase proposals explain
what to buy, why, what it will cost, and what remaining credit or dues are shown for review.
Every purchase proposal needs owner approval.

## Product shape

```text
Touch UI ──► REST requests ─┐
                            ├──► Domain services ──► Postgres
Text/Voice ─► Shared tools ─┘
```

- React + TypeScript + Vite + Tailwind, wrapped for Android with Capacitor
- Node + Express + TypeScript
- Zod schemas shared by REST validation and OpenAI-style function calling
- OpenRouter for provider-switchable LLM tool calls
- Sarvam AI for English speech-to-text in v1
- Append-only stock movements, payment allocations, party ledgers and audit entries
- Reorder proposals, expiry/dead-stock signals and cash-budget-aware purchasing
- MCP is planned after the function-calling tools are stable

## Repository status

This repository currently contains the product requirements and architecture blueprint. The
interactive blueprint is generated locally in the ignored `floorplan/` directory.

- Product requirements: [`docs/PRD_1.md`](docs/PRD_1.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Payment allocation rules: [`docs/payment-allocation.md`](docs/payment-allocation.md)
- Sprint plan: [`docs/sprint-plan.md`](docs/sprint-plan.md)
- Security testing plan: [`docs/security/artex-setup.md`](docs/security/artex-setup.md)

## Source repositories

- Authoritative private repository: https://gitlab.com/saisujithbv/sauda
- Public mirror: https://github.com/bvsaisujith/sauda

GitLab is the main development remote. GitHub is maintained as a public mirror.
