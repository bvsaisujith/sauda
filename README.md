# Sauda

Sauda is an Android-first agentic shop manager for Indian kirana and wholesale retail owners.

The product is touch-first: owners manage items, stock, sales bills, purchase bills, parties,
payments and credit from the app. English voice is a second front door onto the same domain
services. Voice input accepts 22 Indian languages; the interface and read-back stay English.
No agent or voice write changes data until the owner approves a preview.

Sauda reduces dead stock and stockouts using sales history, expiry risk, festival and seasonal
demand signals, an owner-set purchasing cash budget, and repacking of bulk stock into retail packs
with FIFO cost carried through.

## Delivery gates

- **29 November 2026, demo:** items and prices, stock batches and movements, English voice,
  22-language voice input, Android APK, Oracle deployment.
- **15 December 2026, V1:** adds parties, GST bills, purchasing and demand, repacking, payments,
  reports, audit and tests.

See [`docs/sprint-plan.md`](docs/sprint-plan.md) for the exact scope of each gate.

## Product shape

```text
Touch UI ──► REST requests ─┐
                            ├──► module public.ts ──► Postgres
Text/Voice ─► Shared tools ─┘
```

- React + TypeScript + Vite + Tailwind, wrapped for Android with Capacitor
- Node + Express + TypeScript, a modular monolith
- Each module exposes only `modules/<name>/public.ts`; CI rejects deeper imports
- Zod schemas shared by REST validation and OpenAI-style function calling
- OpenRouter for provider-switchable LLM tool calls
- Sarvam AI for speech-to-text
- Prisma and Postgres through `DATABASE_URL`
- Append-only stock movements, FIFO batches, payment allocations, ledgers and audit entries
- Every external provider is environment-configured behind an adapter

## Repository status

The monorepo is live. `packages/shared` holds DTOs and Zod contracts, `apps/api` is the Node
service, `apps/web` is the React app. The interactive blueprint is generated locally in the
ignored `floorplan/` directory.

- Product requirements: [`docs/PRD_1.md`](docs/PRD_1.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Payment allocation rules: [`docs/payment-allocation.md`](docs/payment-allocation.md)
- Delivery plan: [`docs/sprint-plan.md`](docs/sprint-plan.md)
- Security testing plan: [`docs/security/artex-setup.md`](docs/security/artex-setup.md)

## Getting started

Prerequisites: Node 22+ and npm.

```bash
npm install
cp .env.example .env      # fill DATABASE_URL and provider keys
npm run check             # lint, typecheck, test, build
npm run dev               # API on :3000
npm run dev:web           # web app on :5174 (set WEB_PORT to override)
```

The API reads `.env` from the repository root and from `apps/api/.env`. Real environment
variables always win, so production never depends on a file.

### Database

Prisma 7 owns the schema in `apps/api/prisma/schema.prisma` and every change ships as a
migration.

```bash
cd apps/api
npx prisma dev            # local Postgres for development, prints a URL
# point DATABASE_URL at that URL and create the database once: CREATE DATABASE sauda;
npm run migrate:deploy    # apply migrations
npm run smoke:db          # create, read and clean up a few rows
```

Production runs `npm run migrate:deploy -w @sauda/api` on release. Money is stored as whole
paise (`Decimal(14,0)`) and quantities as `Decimal(12,3)`; history tables are append-only.

### Android

The touch app is packaged for Android with Capacitor. The native project is in `apps/web/android`
and uses package ID `com.sauda.shopmanager`.

```powershell
cd apps/web
npm run android:apk       # sync web assets and build debug APK
npm run android:open      # open the project in Android Studio
```

Set `VITE_API_BASE_URL=https://your-api-host.example` before building to point the APK at a
deployed API. Leave it unset for same-origin/web development. The APK includes Internet and
microphone permissions; the device will prompt before microphone recording.

### Voice transcription

`POST /voice/transcribe` accepts a base64 audio clip (WAV, WebM, OGG, MP3, M4A, FLAC or
AIFF, 6 MB maximum), requires a device token, and returns English text. Clips are capped at
30 seconds by Sarvam's REST limit and are never stored.

Sarvam runs `saaras:v4` with `mode=translate` and auto-detected language, so speech in any of
the 22 supported Indian languages comes back as English. Set `SARVAM_API_KEY` (or
`STT_API_KEY`) in `apps/api/.env`.

To test the whole path with a real microphone (requires `ffmpeg` on `PATH`):

```powershell
cd apps/api
$env:SAUDA_SHOP_NAME='Sri Lakshmi Kirana'; $env:SAUDA_PASSWORD='kirana2026'; npm run mic:test
npm run mic:test -- --seconds 8                 # fixed length instead of Enter
npm run mic:test -- --mode transcribe           # original language, not English
npm run mic:test -- --file sample.wav           # skip the microphone
```

Recording starts immediately and stops when you press Enter (or after 30 seconds). The clip is
then sent to the authenticated route and the transcript is printed. The script signs in with
`SAUDA_SHOP_NAME` and `SAUDA_PASSWORD` to mint a device token. Set `SAUDA_TOKEN` instead to
reuse an existing device token.

## Source repositories

- Authoritative private repository: https://gitlab.com/saisujithbv/sauda
- Public mirror: https://github.com/bvsaisujith/sauda

GitLab is the main development remote. GitHub is maintained as a public mirror.
