# Kotizi frontend

Web app for Kotizi, an on-chain real-estate consórcio on Stellar (Soroban, testnet). Members sign
in with email, join a group, pay a fixed installment each round and follow a verifiable draw
(a drand beacon checked by the contract); the contemplated share's credit is reserved for the
property.

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · Privy ·
`@stellar/stellar-sdk` · Freighter (admin only). Runs with [bun](https://bun.sh).

```bash
bun install
cp .env.example .env.local   # optional: add a Privy app id
bun run dev                  # http://localhost:3000
bun run build && bun run start
bun run lint
bun run test                 # bun test: draw/prize rules, the mock contract, helpers
bun run e2e                  # Playwright flows on the mock (once: bunx playwright install chromium)
bun run quality              # lint + typecheck + unit tests + e2e
```

## Mock mode

By default (`NEXT_PUBLIC_CHAIN_CLIENT=mock`) the app runs against an in-memory mock of the Kotizi
contract, so it works without the backend. The mock applies the same checks and error codes as the
contract, persists to `localStorage`, and simulates the other members of each group (they pay every
round and claim their prizes). The header shows a "Mock data" badge.

- Without `NEXT_PUBLIC_PRIVY_APP_ID`, "Sign in" creates a fake account for the browser.
- The account menu has test helpers: reset mock data, and simulate failures (the next confirmation
  cancelled / timed out / network error / generic failure, or a network outage that fails every
  read) to show the error states.

## Stellar mode

`NEXT_PUBLIC_CHAIN_CLIENT=stellar` points the app at the Kotizi contract on Stellar testnet through
the kotizi backend (`../backend`, `NEXT_PUBLIC_API_URL`), with `NEXT_PUBLIC_PRIVY_APP_ID` (the same
Privy app as the backend). The contract id, RPC and network come from the backend's `/v1/config`,
so the app has no variable of its own for them.

```bash
# backend (../backend/.env: AUTH_MODE=privy with the same Privy app, CONTRACT_ID, the key files,
# KYC_MODE=auto, FAUCET_ENABLED=true with FAUCET_TOKEN, CORS_ORIGINS=http://localhost:3000)
cd ../backend && npm start
# frontend (.env.local: NEXT_PUBLIC_PRIVY_APP_ID, NEXT_PUBLIC_CHAIN_CLIENT=stellar,
# NEXT_PUBLIC_API_URL=http://localhost:3001)
bun run dev
```

- **Accounts**: email login through Privy, which gives each account a Stellar embedded wallet.
- **Operator**: "Already have a crypto wallet?" on the landing signs in with Freighter, outside
  Privy: that account browses the groups and, as the contract's admin, creates them; member
  screens show a notice for it.
- **No fees for users**: the wallet only signs Soroban authorization payloads; the backend's relay
  builds the transaction, pays the fee and storage rent, and sends it.
- **Draws**: "Draw now" asks the backend to run the next step (a drand round about 30 s ahead,
  then its beacon, which the contract verifies); its keeper also draws on its own.
- **Status dialog**: every action's progress, outcome and failure show in one dialog.
- **Identity verification (demo)**: name, CPF and date of birth at `/verify`, checked in the
  browser and never sent or stored; the backend's `/v1/kyc` (`KYC_MODE=auto`) records the approval
  `join_group` requires and creates the wallet's ledger account.
- **Checkout**: the app keeps no balance. Joining or paying opens a checkout (bank transfer, Pix or
  crypto, with mock instructions); on testnet it deposits what the wallet lacks through the
  backend's `/v1/faucet` (`FAUCET_ENABLED=true`; one deposit per wallet per day).
- **Group creation**: admin only, signed and paid by the admin's Freighter wallet.

Backend side: add the app's origin to `CORS_ORIGINS` and the same Privy app to its `.env`.

## Structure

```
src/
├── app/
│   ├── globals.css      # design tokens: color primitives + semantics, type-* scale, radius scale
│   ├── page.tsx         # 01 Connect (signed out)
│   ├── verify/          # identity verification (demo)
│   ├── metadata/[file]/ # GET /metadata/<slug>.json, the NFT metadata behind Group.uri
│   └── (app)/           # app shell: tab bar (mobile) / sidebar (>= 1024px)
│       ├── home/        # 02 Home + W web panel
│       ├── groups/      # 03 Groups, [id] 04 Detail, [id]/join 05, [id]/credit 08
│       ├── payments/    # 06 Payments
│       ├── draws/       # 07 Draw
│       └── admin/       # group creation (admin only)
├── features/admin/      # admin hooks and screens (imported from its index only)
├── components/ui/       # design system primitives on Base UI (Button, Card, Badge, Input, Progress…)
├── components/kz/       # kotizi design system (PlanCard, SurfaceList, Timeline, VidroK…)
├── components/          # product pieces by subject: checkout, onchain, group, share, shell, brand
├── chain/               # everything blockchain-specific
│   ├── client.ts        # KotiziClient interface used by the UI
│   ├── network.ts       # the one network: name and explorer links
│   ├── provider.tsx     # ChainProvider / useKotiziClient()
│   ├── types.ts         # mirrors the contract's storage (../contract/kotizi/src/types.rs)
│   ├── derive.ts        # eligibility, prize and draw-phase rules
│   ├── share.ts         # rules about one share (installments, quota status)
│   ├── errors.ts        # contract error codes and transaction failures
│   ├── hooks.ts         # useChainQuery / useChainAction / useNow
│   ├── metadata.ts      # Group.uri JSON: build, parse, fetch
│   ├── api.ts           # backend HTTP client (answers validated with Zod)
│   └── mock/            # mock client + seed data
├── content/groups.ts    # property content per group (mock seed + metadata route)
├── session/             # Privy session (or mock) behind one useSession() hook
└── lib/format.ts        # amount and time formatting
```

UI components only use `useSession()` and the `KotiziClient` interface, so the mock and the Stellar
client are interchangeable without touching them.

## Brand

Colors, fonts and logos follow the Kotizi brandbook: dark graphite background, Kotizi blue
`#0000FF`, lavender `#B6B6F0`, Archivo for text and IBM Plex Mono for figures. Logos are in
`public/brand/` and `src/components/brand/logo.tsx`.

## Licenses

`@stellar/stellar-sdk` and `@stellar/freighter-api` are Apache-2.0.
