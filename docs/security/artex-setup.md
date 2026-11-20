# Sauda security testing with ARTEX

ARTEX is installed at `D:\devtools\ARTEX` and is the planned local security-testing system for Sauda.

## Current state

- ARTEX source checkout: `D:\devtools\ARTEX`
- ARTEX UI/API: `http://127.0.0.1:8787` once Docker Desktop is running
- PostgreSQL: ARTEX's private Docker database, not the future Sauda database
- Target: Sauda only, once application code or a local deployment exists
- Authorization: test only this project and explicitly approved local/staging targets
- Dynamic testing: disabled/not started until a target URL and scope are approved

## Safe first pass for Sauda

1. White-box code audit of the repository: secrets, authentication, authorization, tenant isolation, billing/khata invariants, injection, unsafe file handling, voice input handling, and offline-sync conflicts.
2. Dependency and configuration review: package/module vulnerabilities, container settings, CORS, cookies, headers, storage, logs and secret exposure.
3. API recon against the locally running Sauda app only, after routes exist.
4. API security testing with approval gates: OTP abuse, IDOR/BOLA, role boundaries, invoice cancellation, payment reversal, credit-limit bypass, webhook verification, replay/idempotency and offline-sync duplication.
5. Browser checks for the shopkeeper screens and voice confirmation flow.
6. Evidence-backed report and retest after fixes.

## Important product-specific threat model

- A counter worker must not read or change another shop's customers, stock, bills or khata.
- Voice must never mutate data before explicit visual/audio confirmation.
- Invoice creation, cancellation, payment reversal and offline replay must be idempotent and auditable.
- GST totals, CGST/SGST versus IGST, rounding and sequential invoice numbers must not be client-controlled.
- Razorpay and WhatsApp callbacks must verify signatures and reject replay.
- OTP request/verify needs per-number and per-IP limits without account enumeration.
- PDF generation and shared bill links must not expose another customer's data.
- Customer balances and reversals must not be hard-deleted.
- Voice clips and transcripts may contain sensitive business and personal information; retention and access need an explicit policy.

## Run conditions

ARTEX is deliberately local-only (`127.0.0.1`) and its update check is opt-in/off by default. Keep the untrusted-output boundary enabled and use the quiet target-noise profile for any authorized dynamic test.

Do not run internet scans, exploit modules, or tests against a public endpoint unless its owner has given written permission and the exact host, paths, time window and allowed techniques are in scope.
