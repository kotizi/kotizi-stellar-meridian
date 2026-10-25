# Kotizi frontend

Web app for Kotizi, an on-chain real-estate consórcio on Solana. Members sign in with email
(Privy creates a Solana embedded wallet), join a group, pay a USDC quota each round, run the
verifiable draw and claim the prize.

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · Privy · `@solana/kit`.
Runs with [bun](https://bun.sh).

```bash
bun install
cp .env.example .env.local   # optional: add a Privy app id
bun run dev                  # http://localhost:3000
bun run build && bun run start
bun run lint
bun run test                 # bun test: draw/prize rules, the mock program, the Solana client
bun run e2e                  # Playwright flows on the mock (once: bunx playwright install chromium)
bun run quality              # lint + typecheck + unit tests + e2e
bun run codegen              # Anchor IDL -> src/chain/solana/generated (see below)
bun run devnet:check         # read-only: the generated client against the deployed program
```

## Program client (Codama)

`bun run codegen` turns the program's Anchor IDL into a typed `@solana/kit` client in
`src/chain/solana/generated/` (imports only from `@solana/kit`, ignored by ESLint). It reads
`../target/idl/kotizi.json` by default (from the monorepo root:
`NO_DNA=1 anchor idl build -p kotizi -o target/idl/kotizi.json`); pass another path as the first
argument or in `KOTIZI_IDL`. Commit the generated folder so the app builds without the Rust toolchain,
and rerun codegen whenever the IDL changes.

## Devnet mode

With `NEXT_PUBLIC_CHAIN_CLIENT=solana` the app uses the Kotizi program deployed on devnet through
the kotizi backend (`../backend`, `NEXT_PUBLIC_API_URL`), and needs `NEXT_PUBLIC_PRIVY_APP_ID`
(the same Privy app as the backend). In the Privy dashboard, enable Solana and Ethereum embedded
wallets: email accounts get one of each, and the Ethereum one signs for the EVM networks.

- **Reads**: groups and shares from the backend API (it joins each share with the current holder of
  its NFT and the prize ledger); identity records and USDC balances straight from the RPC.
- **Transactions**: built in the browser with the Codama client, signed by the user's wallet
  (Privy embedded or external) and sent through the backend relay, which pays network fees and
  account rent. Users never need SOL.
- **Draws**: "Draw now" asks the backend to run the next step; its keeper also draws on its own.
- **Identity verification (demo)**: new accounts, and any account whose wallet has no identity
  record yet, are asked for name, CPF and date of birth at `/verify`. The details are checked in the browser and never sent or stored;
  the backend's `/v1/kyc` (enable `KYC_MODE=auto` there) approves the wallet's `KycRecord`, which
  `join_group` requires. A real provider is on the roadmap.
- **Checkout**: the app keeps no balance. Joining or paying opens a checkout (bank transfer, Pix or
  crypto, with mock instructions); on test networks it deposits what the wallet lacks through the
  backend's `/v1/faucet` (enable `FAUCET_ENABLED=true` there; one deposit per wallet per day).

Backend side: add the app's origin to `CORS_ORIGINS` and the same Privy app to its `.env`.

To test with your own keys on a local validator (the devnet program's authorities belong to the
program team), see "Local testing (localnet)" in `AGENTS.md`.

## Mock mode

By default (`NEXT_PUBLIC_CHAIN_CLIENT=mock`) the app runs against an in-memory mock of the
program, so it works without the backend. The mock applies the same checks and error codes
as the on-chain instructions, persists to `localStorage`, and simulates the other members of each
group (they pay every round and claim their prizes). The header shows a "Mock data" badge.

- Without `NEXT_PUBLIC_PRIVY_APP_ID`, "Sign in" creates a fake wallet for the browser.
- The account menu has test helpers: reset mock data, and simulate
  failures (the next confirmation cancelled / timed out / network error / generic failure, or a
  network outage that fails every read) to show the error states.

## Structure

```
src/
├── app/
│   ├── globals.css      # design tokens: color primitives + semantics, type-* scale, radius scale
│   ├── page.tsx         # 01 Connect (signed out)
│   ├── metadata/[file]/ # GET /metadata/<slug>.json, the NFT metadata behind Group.uri
│   └── (app)/           # app shell: tab bar (mobile) / sidebar (>= 1024px)
│       ├── home/        # 02 Home + W web panel
│       ├── groups/      # 03 Groups, [id] 04 Detail, [id]/join 05, [id]/credit 08
│       ├── payments/    # 06 Payments
│       └── draws/       # 07 Draw
├── components/ui/       # design system primitives on Base UI (Button, Card, Badge, Input, Progress…)
├── components/kz/       # design-handoff components (PlanCard, SurfaceList, DrawDigits, VidroK…)
├── components/shell/    # TabBar, Sidebar, MobileTopBar, AccountMenu
├── components/share/     # share switcher, quota status, pay button, share gate
├── chain/               # everything blockchain-specific
│   ├── client.ts        # KotiziClient interface used by the UI
│   ├── network.ts       # networks (mock, Solana, EVM) and the network each id belongs to
│   ├── router.ts        # KotiziRouter: one client over every network
│   ├── provider.tsx     # ChainProvider / useKotiziClient(): client built with the session signer
│   ├── types.ts         # mirrors programs/kotizi/src/state.rs
│   ├── derive.ts        # eligibility, prize and draw-phase rules
│   ├── errors.ts        # program error codes
│   ├── hooks.ts         # useChainQuery / useChainAction / useNow
│   ├── metadata.ts      # Group.uri JSON (Metaplex standard): build, parse, fetch
│   ├── api.ts           # backend HTTP client (Solana and /v1/evm)
│   ├── evm/             # EvmKotiziClient (gasless EIP-712 via the backend relay), the five testnets
│   ├── solana/          # SolanaKotiziClient, relay pipeline, PDAs, error mapping
│   │   └── generated/   # Codama client (bun run codegen)
│   └── mock/            # mock client + seed data
├── content/groups.ts    # property content per group (mock seed + metadata route)
├── session/             # Privy session (or mock) behind one useSession() hook
├── components/          # brand and group components
└── lib/format.ts        # USDC and time formatting
```

UI components only use `useSession()` and the `KotiziClient` interface, so the mock and the
Solana client (and other chains later) are interchangeable without touching them.

## Brand

Colors, fonts and logos follow the Kotizi brandbook (`design/` in the parent folder): dark
graphite background, Kotizi blue `#0000FF`, lavender `#B6B6F0`, Archivo for text and IBM Plex Mono
for figures. Logos are in `public/brand/` and `src/components/brand/logo.tsx`.
