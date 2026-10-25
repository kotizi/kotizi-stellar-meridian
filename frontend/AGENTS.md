<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# kotizi frontend: agent guide

kotizi is a tokenized real-estate **consórcio** (a ROSCA) on Solana: members join a group, pay a
fixed USDC quota each round into a program-owned vault, and each round one eligible member is
drawn and claims the pool. Each membership (share) is a Metaplex Core NFT. This folder is the web
app; the Anchor program (`../programs/kotizi`), `../scripts/` and the devnet deploy belong to the
rest of the team, and the IDL and deployed addresses come from them. When this file and the
monorepo docs disagree, `../PLAN.md`, `../docs/program-overview.md` and
`../docs/functions-and-flow.md` win.

Hackathon: Colosseum Crypto World's Fair (Solana track), deadline 2026-10-12 23:59 PT. Keep
chain-specific code behind a clear boundary: other chains come later.

## Language

- Everything here is in **English**: code, identifiers, comments, UI copy, docs and commit
  messages (hackathon rules §12(a)(i)).
- Use the program's English names in code (`Group`, `Membership`, `quota`, `draw`, `prize`).
- **"Share", never "cota"** (user decision, 2026-10-12): a member's place in a group (the membership
  NFT) is a *share* everywhere in the frontend, in copy, code, file names and docs (`MyShare`,
  `ShareSwitcher`, `formatShare`, `components/share/`). Not "quota": in the program `quota` is the
  installment amount. Only names owned by others keep "cota": the backend's `cotas` field in `/me`
  and the `no_eligible_cotas` reason, the EVM contract's `CotaNotFound`/`NotCotaOwner`/`cotaOwners`,
  and the Codama output in `src/chain/solana/generated/`. "Consórcio" may still appear in docs and
  pitch with an English gloss.

## Stack and tooling

- Self-contained app with its own `package.json`; run every command from this folder. See
  `README.md` for structure and commands.
- **Next.js 16** (App Router, Turbopack, `cacheComponents` on), TypeScript, **Tailwind CSS 4**,
  **shadcn/ui** (`base-nova` style, built on Base UI: use the `render` prop, not `asChild`),
  **Privy** (`@privy-io/react-auth`) and `@solana/kit` 8.4.
- Prerender rules bite: no `Date.now()` or `usePathname()` outside `<Suspense>` in prerendered
  client components.
- **bun only**: `bun install`, `bun add`, `bun run`, `bunx`. Never npm, yarn or pnpm here, and
  never their lockfiles.
- Verify with `bun run quality` (lint, `tsc --noEmit`, unit tests, e2e) and `bun run build`. Unit
  tests (`src/**/*.test.ts`, `bun:test`, `bun run test` = `bun test src`) cover `derive.ts`, the
  mock's program rules and small helpers; keep them passing. `build` and `dev` share `.next/`:
  don't build while a dev server is running (it ends up serving stale CSS); if it happens, restart
  it with `rm -rf .next && bun run dev`. Start the next dev server after a build the same way: on
  2026-10-22 a dev server started over a build's `.next/` hung forever compiling `/payments`
  (`page.goto` → `ERR_ABORTED` in the e2e); with a clean `.next/` it compiled in 5 s.
- **ESLint enforces the layers** (`eslint.config.mjs`, `no-restricted-imports`): `src/app/**`,
  `src/components/**` and `src/features/**` never import chain SDKs (`@solana/*`, `viem`), chain implementations
  (`@/chain/solana|evm|mock/*`) or Privy (`@privy-io/*`, `@/session/privy-*`); they use the
  `@/chain` hooks and `useSession()`. `src/chain/**` (tests excepted) never imports `@/components/*`,
  `@/app/*` or `@/features/*`. A new block with `no-restricted-imports` for the same files replaces these patterns
  instead of adding to them: extend the existing `patterns` (`eslint.config.mjs` keeps them in
  `uiPatterns`; the design system block repeats them before its own). `@typescript-eslint/no-floating-promises`
  is on for every `.ts/.tsx` (type-aware, `projectService`): await, return or `void` every promise.
- **Domain rules live in `src/chain/`, never in components or hooks** (2026-10-22): `derive.ts` mirrors
  the program (group and share index), `share.ts` adds the rules about one share (`ShareRef` = group +
  membership: `quotaStatus`, `canClaim`, `installmentsPaid`, `installmentsTotal`,
  `currentInstallment`), each with its `*.test.ts`. Hooks only read (`use-my-shares.ts`: `useMyShares`,
  `MyShare extends ShareRef`). Copy built from those rules stays with the UI that shows it
  (`components/share/installment-label.ts`: "Installment 3 of 5" / "Installment for draw 4").
- **`components/` by role** (2026-10-22): `ui/` (shadcn on Base UI) and `kz/` (kotizi's design
  system: `chip`, `field`, `screen`, `surface-list`, `plan-card`, `luz`, `vidro-k`, `timeline`…) are
  presentation only and take data through props; ESLint forbids them from importing `@/chain`,
  `@/session`, `@/content`, `@/config`, features, routes or any other `components/` folder. Product
  pieces live by subject: `checkout/` (`checkout-dialog`, `deposit-methods`, `network-fee-row`),
  `onchain/` (`onchain-details`, `tx-link`, `load-error`), `group/` (incl. `draw-digits`), `share/`,
  `shell/`, `brand/`.
- **Thin routes** (2026-10-22): every `page.tsx` is a server component that only renders its screen,
  a `<name>-view.tsx` next to it (`HomeView`, `DrawsView`, `PaymentsView`, `GroupsView`,
  `ConnectView` for `/`, `GroupView`, `JoinView`, `CreditView`, `VerifyView`), or a view from a
  feature (`CreateGroupView`). Route-only concerns stay in `page.tsx`: awaiting `params` inside
  `<Suspense>`, `export const instant`. The view holds `"use client"` and the screen's components,
  so moving a screen into `src/features/` touches only its view and one import.
- **Feature folders** (pilot, 2026-10-22): `src/features/<name>/{hooks,components,index.ts}`; the
  rest of the app imports a feature only from its index (`@/features/<name>`; ESLint forbids
  `@/features/*/*`), and inside a feature imports are relative. Routes (`page.tsx`, `layout.tsx`)
  stay in `app/` and import from the feature. Only `admin` is migrated: `useIsAdmin`, `AdminGate`,
  `CreateGroupLink`, `CreateGroupView` (plus the internal `useAdminNetworks`); the other screens stay
  in `components/` until a feature is worth moving.
- **E2E** (Playwright, `e2e/`, `bun run e2e`; once: `bunx playwright install chromium`): starts its
  own `next dev` on port 5000 with the mock chain client and the mock session. The `setup` project
  (`auth.setup.ts`) signs in, fills `/verify` and saves `playwright/.auth/user.json`; specs start
  signed in (`login.spec.ts` opts out). Tests share no state: each joins first (`e2e/helpers.ts`:
  `joinGroup`, `drawNow`). Pick groups by name, never by address (mock addresses are random); query
  by role and accessible name, never by CSS. On a failure, read
  `test-results/<test>/error-context.md` (the page's aria snapshot) first. Assertions wait up to 15 s
  (`expect.timeout`): the dev server compiles each route on its first visit, and a `bun run build`
  empties its cache.
- Commits follow Conventional Commits (`feat(frontend): ...`).

## Program scope the UI builds on

8 instructions (Anchor 0.32.1, program ID `FGSa94mooAstAWBcevwvRSY8QFXakiidJkecCDWpnG1n`):
`initialize_config`, `approve_kyc`, `create_group`, `join_group`, `pay_quota`, `request_draw`,
`settle_draw`, `claim_prize`. UI features: walletless login, browse and join groups (needs an
approved KYC record), pay the quota, "draw now" (permissionless), the credit reserved for the
property (no claim in the UI), show the user's shares, and group creation for the admin
(`/admin/groups/new`). Out of scope
(roadmap only): marketplace, bids, default handling, real KYC provider, property registration
(properties are the fixed `GROUP_CONTENT` list in `src/content/groups.ts`; a screen to register them
is for a next hackathon, user decision 2026-10-12).

- The program is **deployed on devnet**. Draw sources: slot hash and **ORAO VRF** (Switchboard
  was replaced).
- **Per-share prize ledger**: `Group.prizes[64]`, `wonRound[64]`, `unclaimedBitmap`,
  `unclaimedTotal`. An unclaimed prize never blocks the next draw; a share claims in any round.
- **Backend** (`../backend`, teammates'): Privy-authenticated sponsored relay
  (`POST /v1/tx/relay`), reads (`/v1/config`, `/v1/groups[/:address[/members]]`, `/v1/me`),
  "draw now" (`POST /v1/groups/:address/draw`) plus a keeper that draws on its own, and demo
  onboarding (`/v1/kyc`, `/v1/faucet`). `../app/` is the teammates' reference frontend;
  `../app/src/lib/kotizi-context.tsx` shows each action end to end.

## Auth and network fees

- **Walletless via Privy**: email login (Google removed, user decision 2026-10-11) creates a Solana embedded wallet; external Solana
  wallets are also allowed. Without `NEXT_PUBLIC_PRIVY_APP_ID` the app uses a mock session. UI
  reads auth only through `useSession()` (`src/session/`).
- **Wallet login** (user decision 2026-10-11): the landing offers a wallet (a quiet text link, "Already have a crypto wallet? Use it
  instead", under the only button, "Sign in with email": email is the path we recommend, user decision
  2026-10-12) (Privy's
  `loginMethods: ["wallet"]`, Solana connectors with auto-connect, and Ethereum wallets since
  2026-10-12, see "EVM wallet login"); the one place the UI says
  "wallet". The session address comes from the Solana wallets **linked** to the Privy user
  (embedded first, then a connected external one, then any linked one), so it's known even while
  an external wallet is disconnected (e.g. after a reload). The signer exists whenever there is an
  address: if that wallet isn't connected when a confirmation signs, it opens Privy's connect modal
  (`useConnectWallet`, "Reconnect your wallet to confirm.") and signs once the same wallet is back;
  closing it, connecting a different wallet or 2 minutes without it → `UserRejected`
  ("Confirmation cancelled"). Wallet-only accounts have no email: the account menu shows "Signed in".
  The Solana wallet login must be enabled in the Privy dashboard.
- `embeddedWallets.solana.createOnLogin` is `"users-without-wallets"`. External wallets are
  sponsored too (the relay accepts any Solana wallet linked to the Privy user), so `"all-users"`
  is no longer needed for sponsorship.
- **Network fees and rent are the app's, never the user's**, through the **backend relay**
  (decided 2026-10-11; replaces Privy's native sponsorship). The session wallet only signs
  (`SessionSigner.signTransaction`); `relayInstructions` (`src/chain/solana/send.ts`) builds the
  transaction with the backend's sponsor as fee payer (`GET /v1/config` → `feePayer`), lets every
  attached signer sign and posts it with the Privy access token (`Session.getAccessToken()`). The
  relay validates, simulates (a failure comes back as 422 with program logs), adds the sponsor's
  signature, sends and answers once confirmed. `join_group` also takes the sponsor as `payer`, so
  rent is covered. No SOL, gas or fee handling anywhere in the UI or code. Privy's wallet modal is off
  (`embeddedWallets.showWalletUIs: false`, user decision 2026-10-11): our screens are the single
  confirmation step and show "Network fee · covered by kotizi · FREE" (`checkout/network-fee-row.tsx`)
  on join and pay. External wallets still show their own prompt. **Every payment asks for confirmation in our own
  modal** (user rule, 2026-10-11, against misclicks): the checkout, `checkout/checkout-dialog.tsx`
  (2026-10-12, replaces `ConfirmPaymentDialog`), shows the amount, the details and the free network
  fee; Cancel has the initial focus (Enter or Esc never pays). Used by `PayQuotaButton` (home and
  `/payments`) and the join screen ("Join group" → "Confirm and join"). Any new paying action must
  open it too.

## Chain access (ADR-001: hybrid adapter)

- **Mock-first**: all chain access goes through the `KotiziClient` interface
  (`src/chain/client.ts`). `MockKotiziClient` (`src/chain/mock/`) mirrors the program's checks and
  error codes and is the default (`NEXT_PUBLIC_CHAIN_CLIENT=mock`); it stays as a labelled
  fallback. `SolanaKotiziClient` implements the same interface. UI components never import
  chain libraries.
- Draws: `KotiziClient.drawNow({ group })` runs the next step (`request_draw` or `settle_draw`)
  or returns why there is none (`notDue`, `noEligibleShares`, `waitingForRandomness`,
  `completed`, the keeper's reasons). `drawUntilSettled` (`src/chain/draw.ts`) makes the
  "Draw now" button a single click. The mock picks steps the way the keeper does.
- **Draw threshold** (user decision, 2026-10-12; frontend only, the program doesn't know it): the
  app draws only once `DRAW_THRESHOLD_PCT` (80%, one constant in `src/chain/derive.ts`) of the
  **taken** shares paid the period's installment (`paidRequired` = ceil(joined × 80%), contemplated
  shares that keep paying count). `drawPhase` adds `"belowThreshold"` on top of `chainDrawPhase`
  (the program's rules, used by the mock); "Draw now" only shows when due, `drawUntilSettled`
  refuses to start a draw below it (`belowThreshold` reason) but always reveals a pending one, and
  draws/home show "N more installments to open the draw" (`components/group/draw-threshold.tsx`).
  Limitation: the backend keeper still draws on the due date and `request_draw` is permissionless;
  enforcing it needs the keeper (teammates) or the program (roadmap).
- **Group creation (admin only)** (user decision, 2026-10-12): `/admin/groups/new`, linked from
  the groups page ("Create group") and the account menu only when `useIsAdmin()` (`src/features/admin`,
  `KotiziClient.isAdmin`: Solana compares with `GET /v1/config` → `admin`; the mock lets every
  account create, it has no config). Form: property (a `GROUP_CONTENT` slug; `uri` =
  `<origin>/metadata/<slug>.json?value=<usd>`), name (≤ 32 bytes), property value (prefilled
  from the content, editable), shares (2–64), period chips (1 min, 5 min, daily, monthly), admin fee
  (≤ 10%). **The admin sets the property value and the credit value equals it** (user decision,
  2026-10-12): the installment isn't typed, it's value ÷ shares, and a share count that doesn't split
  the value into whole cents is refused with the nearest counts that do. The program has no
  property value: it travels in the uri (`?value=`, read by `app/metadata/[file]/route.ts`, which
  falls back to the content's `propertyValueUsd`), so only groups created from this screen are aligned;
  confirmation modal with Cancel focused. `KotiziClient.createGroup` mirrors the program's checks
  (`NameTooLong`, `UriTooLong`, `InvalidQuota`, `InvalidMaxMembers`, `InvalidPeriod`, `FeeTooHigh`,
  `Unauthorized`). **Not sponsored**: the program makes the organizer pay the group and vault rent
  (`payer = organizer`) and the relay doesn't accept `create_group`, so the admin pays the network
  fee too: `sendInstructions` (`src/chain/solana/send.ts`) sends straight to the RPC with the
  admin's wallet as fee payer and polls until confirmed; an admin without SOL gets `NotEnoughSol`
  (`toAdminTxError`, only on this path: on the relay the payer is the sponsor). The only exception
  to "fees are never the user's": the admin is the operator. On the own devnet deployment the admin
  is the `8rmpzn…` key: to use the screen, import it into an external wallet and "Sign in with
  wallet" (never print or commit it). The metadata uri uses the browser's origin, so create groups
  from the deployed app, not localhost, if others must read their content.
  **Tested on devnet (2026-10-12)** against the official deployment (`FGSa94…`, admin/KYC/mint
  `9Yf16w…`, the key a teammate shared, kept at `scripts/keypairs/authority.json` and imported into
  Solflare; "Sign in with wallet"): "Create group" shows for the admin, `create_group` was signed,
  sent straight to the RPC and confirmed, and the group page loads from the backend. Groups can't be
  closed on chain, so test groups stay listed for everyone. The first test group (`CGYygo…`,
  50,000 × 20) predates the form deriving the installment, and its `vila-serena` slug went away
  with the old list (10 new properties, 2026-10-12, user request), so it shows no property details.
  `KycRecord`s are per program (`["kyc", wallet]` under the program id): the wallets verified on
  our own deployment (`4xLZ…`, 10 of them) have none on `FGSa94…`, so each goes through `/verify`
  once more after the switch. Expected, not a bug.
- Keep `src/chain/types.ts`, `derive.ts` and `errors.ts` in sync with `../programs/kotizi/src`.
  `src/chain/solana/errors.ts` must match `errors.rs` (a test checks it). The membership PDA
  (`["member", group, index]`) can't be derived by Codama; all PDAs live in
  `src/chain/solana/pda.ts`.

```
app/ + components/  (UI: no chain SDK imports; LoadError for failed reads)
   │ useSession()                       │ useChainQuery / useChainAction / useKotiziClient
   ▼                                    ▼
src/session/                         src/chain/
├── context.ts   Session + SessionSigner   ├── provider.tsx  ChainProvider: createKotiziClient({ signer }) → KotiziRouter
├── privy-session.tsx (Privy wallet →      ├── hooks.ts      in-house query layer, keyed + deduped (no TanStack Query)
│   signTransaction, getAccessToken)       ├── client.ts     KotiziClient interface (+ optional `testing`)
├── mock-session.tsx (signer: null)        ├── types.ts derive.ts   chain-agnostic, mirror the program
├── provider.tsx SessionProvider: Privy|mock ├── network.ts    NetworkId, getNetwork, networkOfId (ids name their network)
│                                          ├── router.ts     KotiziRouter: one client over every network
│                                          ├── draw.ts       drawUntilSettled: one-click "Draw now"
│                                          ├── errors.ts     KotiziError: program codes + tx failures (UserRejected,
│                                          │                 TransactionExpired, NetworkError, SessionExpired,
│                                          │                 SponsorUnavailable, ServiceUnavailable, TransactionFailed)
└── identity-check.ts (login → /verify)    ├── metadata.ts   Group.uri JSON (Metaplex standard) build/parse/fetch (+ app-wide cache)
                                           ├── api.ts        backend HTTP client (Solana and /v1/evm), answers checked with Zod
                                           ├── views.ts      backend group/draw fields both networks share (toGroupState, toDrawStep)
                                           ├── evm/          chains.ts (five testnets), client.ts EvmKotiziClient, sign.ts views.ts errors.ts
                                           ├── mock/         MockKotiziClient (localStorage, bots, failure simulation) — default
                                           └── solana/       program.ts pda.ts signer.ts api.ts send.ts errors.ts (done, unit-tested)
                                               generated/    Codama output of `bun run codegen` (from target/idl, committed)
                                               client.ts     SolanaKotiziClient; views.ts backend shapes → app types
src/content/groups.ts   property content per group slug (mock seed + metadata route)
app/metadata/[file]     GET /metadata/<slug>.json: NFT metadata behind Group.uri (CORS open)
```

The BFF once planned under `app/api/devnet/` is dropped: the backend does KYC and the faucet.

Providers nest as `SessionProvider → ChainProvider → UI` (`app/providers.tsx`). `SessionProvider`
(`src/session/provider.tsx`) is the composition root for the session: the only place that picks
`PrivySession` (with `NEXT_PUBLIC_PRIVY_APP_ID`) or `MockSession`; `app/` never imports either.
The client is rebuilt when the signer changes; the mock is a single shared instance. Queries poll only while the tab is visible, on wall-clock
multiples of their interval (readers of a key ask together, one request); an answer equal to the
last one keeps the old object (`sameValue`, no re-render); a key nobody reads for 5 min leaves the
cache. Parts one layout hides by CSS (sidebar, mobile top bar, home's desktop-only cards) are
wrapped in `<Breakpoint show="desktop" | "mobile">` so they don't mount, and poll, on the other.
`KotiziClient.listSharesByOwner` returns each share with its group (Solana: the group and its member
list are read in parallel). Identity-record reads always go through `useKyc` / `useWalletState`
(`src/chain/use-account.ts`) so every reader shares one key and fetcher; `useKyc` stops polling
once the record exists (actions still refetch it). `bun run codegen [idl.json]` (`scripts/codegen.ts`) writes
the Codama client; it imports only from `@solana/kit` and is committed. Group metadata: the
devnet seed's `GROUP_URI` should point at a property of `src/content/groups.ts` with the group's
credit as `?value=` (the seed's 5 × 100 USD), e.g. `<app origin>/metadata/porto-novo.json?value=500`.

## Multichain and EVM integration (2026-10-12)

The teammates' EVM contracts (`evm/` on `feature/evm-contracts`: `Kotizi.sol`, ERC-721 shares,
`KotiziForwarder` for gasless EIP-712 meta-transactions, `TestUSDC`) are deployed on five testnets:
Ethereum Sepolia 11155111, Arbitrum Sepolia 421614, Base Sepolia 84532, Tempo Moderato 42431,
Robinhood Chain testnet 46630. The backend serves them under `/v1/evm`. Start from
`evm/docs/frontend-integration.md`. That branch isn't merged here yet: this frontend is prepared
first, then it's merged in.

Decisions (user, 2026-10-12):

- **The network is a property of the group, never a user choice.** One group list across every
  network; the UI names the network only in `OnchainDetails`. All five EVM testnets join next to
  Solana. `viem` is approved as a dependency (EVM code only, under `src/chain/evm/`). The admin
  picks the network when creating a group.
- **Visibility**: the user sees the groups of the networks their account can sign on. Email login
  (Privy embedded Solana + Ethereum wallets; the Ethereum one is the same address on all five EVM
  networks) sees all six. Wallet login (since 2026-10-12, see "EVM wallet login" below) takes Solana
  and Ethereum wallets; an Ethereum wallet login (MetaMask, Rabby, Coinbase) signs on the EVM networks
  with that wallet, switching networks before each signature.
- **Identity verification**: one form for every network. After it, the app asks for approval on
  every visible network in the background (`POST /v1/kyc`, `POST /v1/evm/:chainId/kyc`, sponsored;
  the EVM KYC authority is one account on all five networks); before a join, a network still without
  a record is approved first, invisibly.
- **No balance in the platform**: the user never keeps money in the account; money is added only at
  checkout (paying an installment or joining), lands on the group's network and goes into the group
  vault (on-chain it passes through the member's wallet, which the program pulls from). Built in
  step 4, see "Checkout, no balance" under "UI rules". A cross-chain bridge (CCTP/Gateway with native
  USDC) is roadmap: the token is the team's own `TestUSDC` per network.

Plan: (1) network model, neutral ids and the client router (**done**, below); (2) session with a
wallet per ecosystem and EIP-712 signing (**done**); (3) identity verification on every network (**done**); (4) checkout
without a balance (**done**); then, after the merge, `EvmKotiziClient` (**done**, below).

Done (step 1):

- `src/chain/network.ts`: `NetworkId` (`"mock"`, `"solana"`, `` `evm-${chainId}` ``), `getNetwork`
  (name and explorer link per network), `defaultNetworkId` (from `NEXT_PUBLIC_CHAIN_CLIENT`) and
  `networkOfId`.
- `Group.id` / `Membership.id` (`GroupId`, `MembershipId`) are what routes, links, keys, caches and
  the selected share use; `address` stays the on-chain account shown in the on-chain details.
  `Group.network` says where it lives. On Solana (and the mock) the id is the account address, so
  old links keep working; EVM ids will be `evm-<chainId>-<groupId>` (share: `…-<index>`). Every
  `KotiziClient` method that names a group or share takes its id. Routes are `/groups/[id]`. The mock
  storage moved to `kotizi:mock:v4`.
- `KotiziRouter` (`src/chain/router.ts`, tested) is the client the UI gets: lists merge every
  network (a failing network is left out; only all failing fails the read), a group or share goes to
  the network its id names, an id on a network the app doesn't serve is no group. Account calls
  (identity, balance, admin, test helpers, group creation) go to the default network until step 2.
- `TxLink` and `OnchainDetails` take the item's `network` (explorer and name per network; Solana
  localnet links point the explorer at the local RPC).

Done (step 2):

- `viem` 2.56.5 (same as the teammates' reference). `src/chain/evm/chains.ts`: the five testnets
  from `viem/chains` (same chain ids, RPCs and explorers as `evm/chains.json`) with the team's names;
  `network.ts` registers them as `evm-<chainId>` (`evmNetworkId`), with their explorers.
- `Session.wallets` (`{ solana, evm }`) and `Session.evmSigner` (`signTypedData(TypedData)` →
  0x signature; `TypedData` is plain JSON, numbers as decimal strings). `signer` stays the Solana
  one; `address` is the primary network's (see "EVM wallet login"). The mock session has no EVM wallet.
- Privy: `embeddedWallets.ethereum.createOnLogin: "users-without-wallets"`, `supportedChains` = the
  five testnets; signing goes through `useSignTypedData` with `showWalletUIs: false` (our screens
  confirm). An email account that lacks an embedded wallet (Ethereum: created before the EVM
  networks; Solana: a signup hit by the 2026-10-12 race) gets it on its next visit or login
  (`useRepairEmbeddedWallets` + `missingEmbeddedWallets`, once per account and tab, never for a new
  account). It runs in `useLogin`'s `onComplete`, after Privy's modal: calling `createWallet` while
  that modal creates a new account's wallets took the modal over (stuck on "Creating your wallet",
  Solana never created; found 2026-10-12). **Privy dashboard**: enable Ethereum
  embedded wallets. (Wallet login: see "EVM wallet login" below.)
- Nothing uses the EVM wallet yet: the chain client gets `evmSigner` with `EvmKotiziClient`.

Done (step 3):

- `KotiziRouter` gets the session's wallets (`createKotiziClient({ …, wallets })`; `ChainProvider`
  rebuilds it when they change). **Visibility**: signed in, only the networks the account has a
  wallet for (`ecosystemOf` in `network.ts`: `solana` or `evm`); signed out, every network.
  **Wallet**: the UI keeps passing `Session.address` as `owner`; on another ecosystem the router acts
  with the account's wallet there (none → `AccountNotFound`). `useGroup().mine` matches any of the
  account's wallets.
- **Identity**: `verifyIdentity` approves the default network (what `/verify` waits for), then
  records it on the account's other networks in the background (one that fails never fails the
  form). `joinGroup` on another network records it first when missing, but only for an account
  verified on the default network (else `KycRequired`). The gate (`/verify`) still reads the default
  network's record. Tested with fake clients (`router.test.ts`); with one network (today) nothing
  changes. The EVM calls (`/v1/evm/:chainId/kyc`) arrive with `EvmKotiziClient.verifyIdentity`.

Done (EVM client, after the merge of `feature/evm-contracts`):

- `EvmKotiziClient` (`src/chain/evm/client.ts`, tested), one per chain in `NEXT_PUBLIC_EVM_CHAINS`
  (comma-separated chain ids; empty = none, never next to the mock), registered in the router by
  `createKotiziClient` with the session's `evmSigner`. Everything goes through the backend's
  `/v1/evm/:chainId` routes (needs `EVM_ENABLED=true` and the sponsor key in `backend/.env`):
  groups, members, `me` (identity flag, balance, shares), `prepare`, `relay`, `kyc`, `faucet`,
  `groups/:id/draw`. Contract addresses and the admin come from `/config` (no generated registry in
  the front); the three relayed calls are a `parseAbi` fragment checked against `evm/abi/Kotizi.json`.
- Writes: forward request (ERC-2771) signed by the session's EVM wallet, plus an EIP-2612 permit for
  exactly one quota to pay (`evm/sign.ts`, adapted from the team's reference); one request at a time
  (the forwarder nonce). A join with the first installment is two requests (join, then pay); the new
  share is the one the wallet didn't hold before.
- `evm/views.ts`: ids (`evm-<chainId>-<groupId>[-<index>]`, `parseEvmId`), backend shapes → `Group`
  (`drawSource: "blockHash"`, `commitSlot` = the commit block, `address` = the Kotizi contract) and
  `Membership` (owner checksummed; the session's EVM address too). `evm/errors.ts`: contract error
  names in the relay's 422 → app errors (`NotKyc` → `KycRequired`, `NotCotaOwner` → `NotAssetOwner`,
  `ERC20InsufficientBalance` → `InsufficientFunds`…), backend codes like Solana's.
- `src/chain/api.ts` (moved from `solana/api.ts`) is the backend client both use. **Every answer is
  validated with Zod** (`request(path, schema, options?)`, no bare `request<T>`): `safeParse` after
  the `!response.ok` check; a mismatch throws `BackendError(502, "invalid_response")`, which the
  `status >= 500` mapping turns into `ServiceUnavailable`. Schemas live next to the views
  (`chain/views.ts`: `numericString`, `groupStateViewSchema`; `solana/views.ts` and `evm/views.ts`:
  one `*ViewSchema` per route); the view types are their `z.infer`. Bigints stay strings in the
  schemas; `toGroup`/`toGroupState` convert them. The fake `request` in the client tests runs
  `schema.parse`, so fixtures must match the backend. Checked against the running backend on
  2026-10-22: 47 GET answers (Solana and the five EVM networks) match, and a signed-in home with
  Solana and EVM shares loads (`/v1/me` and `/v1/evm/:chainId/me`).
- Known limits: the contract keeps no payment total per share, so EVM shares have
  `Membership.totalPaid: null` and the app doesn't number their installments (user decision,
  2026-10-12, backend change deferred): `installmentName`/`installmentOfTotal` (`components/share/installment-label.ts`,
  tested) say "Installment for draw N", home's plan card shows draws instead of installments, and
  "Your share's path" lists only the current draw's installment. Exact numbers need the backend to
  sum the `QuotaPaid` events (roadmap). Also: the EVM demo groups' `uri` is the
  backend's NFT JSON, not a `GROUP_CONTENT` property, so they show no property details; Robinhood works through its registry RPC; it only failed because this machine's DNS (Quad9) resolved nothing under robinhood.com (switched to Google DNS on 2026-10-12; `EVM_RPC_URL_46630` with `https://robinhood-testnet.drpc.org` is the fallback); the local `NEXT_PUBLIC_EVM_CHAINS` includes 46630; the EVM faucet is once per wallet per day too.
- Checked against the running backend (2026-10-12): reads on Ethereum Sepolia, Arbitrum Sepolia,
  Base Sepolia and Tempo Moderato (one "Casa Kotizi Demo" each; Base and Tempo are full). **Join
  tested end to end on Arbitrum Sepolia** (email account, embedded EVM wallet): checkout deposit
  (`/faucet`), identity recorded on that network (`/kyc`), `joinGroup` and `payQuotaWithPermit` as
  two relayed requests; the share (index 4) shows as paid on chain.

**Pending tests** (2026-10-12, before the submission; frontend). Run by Claude in the browser on
2026-10-12: lint, typecheck, 142 unit tests and the production build pass (the build ran in a copy,
so the dev server kept running); mock mode works end to end (login, `/verify`, join with Pix,
"Draw now", pay with Crypto and its "Paid with" receipt, admin group creation) and no screen says
"cota"; home with a Solana share (Casa Serra) and an EVM share (Casa Kotizi Demo) side by side
switches correctly. Fixed then: the checkout overflowed short phone screens with no scroll
(`ui/dialog.tsx` caps the height at the viewport and scrolls), and mock-created groups lost their
property content because the mock didn't accept the `?value=` the admin form adds to the uri.

After restarting the backend (same day), against devnet and the EVM testnets: **Solana checkout
passes**: joining "Casa Kotizi Demo" (`51Mtjt…`) went through the relay without a deposit (the wallet
already held enough), paying the next installment from `/payments` too ("Paid with Crypto"), and a
join that needs a deposit after today's faucet shows "Deposit limit reached" (faucet 429) and creates
no share. With Solana and EVM shares together, `/payments`, `/draws` ("3 more installments to open
the draw", network "Arbitrum Sepolia" in the details) and "Go to my share" from the EVM group (it
switches the selected share) work.

Still open:
1. Pay an EVM installment from `/payments` without a deposit: needs the Arbitrum group to open draw 2
   (4 of 5 shares paid; the other shares are the teammates'). The same router path passed on Solana.
2. A brand-new email account: `/verify`, then the backend logs show `POST /v1/evm/:chainId/kyc` on
   the four EVM networks in the background (needs a new email inbox: the user runs it).
3. ~~Wallet login: only Solana groups listed~~: checked with Solflare (the admin key): `/groups` and
   home list only the Solana groups, and "Create group" shows.

Backend rate limit (found 2026-10-12, Solflare login): the backend allows 120 requests a minute per
IP (`backend/src/app.ts`, `@fastify/rate-limit`). The email account's home read every network every
5 s (~216 requests a minute with four shares), so the limit answered 429 and the next login (same IP)
saw failed reads for a few seconds. Frontend fix: polls every 10 s by default (`hooks.ts`), the open
groups list every 20 s, a group page every 5 s, and the EVM client reads a group's shares without
reading the group again, shares concurrent reads of one group and of `/me`, and fetches a share list's
groups and members in parallel; group metadata is cached once per uri for the whole app
(`cachedGroupMetadata`, `metadata.ts`). About 90 a minute now, still close with two tabs open.
Measured again on 2026-10-22 (two Solana and three EVM shares): one idle home tab made exactly 120
a minute (137 in the first minute), so `/draws` and a second tab got 429s and error screens. Fix:
the share list (`useMyShares`: `/me` on every network plus each share's group and members) polls
every 30 s instead of 10 s (own actions still refetch at once), and `api.ts` repeats a rate-limited
GET after 2, 4 and 8 s before failing (writes are never repeated).
**Teammates (backend)**: raise the limit (or skip it for GETs) before the demo.

Small notes: on `/payments` the join's first installment has no "Paid with" row (only installments
paid from the checkout record the method); after a draw, `/draws` titles the next draw while still
showing the last result (by design: `lastDrawShown`).

Can't be tested alone today:
- EVM "Draw now": the Arbitrum group has one paid share and the app opens a draw at 80% paid; the
  other four shares are the teammates'. Needs them to pay, or a group made only of our accounts.
  Covered by unit tests only.
- Robinhood: fixed (2026-10-12). The machine's DNS (Quad9) didn't resolve robinhood.com; with Google DNS the
  registry RPC answers and its "Casa Kotizi Demo" (4/5) loads in the app. No backend variable needed.

**EVM wallet login (done 2026-10-12, user decision: option B, wallet login for everyone; branch
`feature/evm-wallet-connect`).**
- Privy `walletChainType: "ethereum-and-solana"`: "Sign in with wallet" takes Solana wallets and
  Privy's default Ethereum connectors (injected: MetaMask, Rabby…; Coinbase). WalletConnect only with
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. **Privy dashboard**: Ethereum external wallets enabled.
- `Session.wallets.evm`: the linked Ethereum wallet, embedded first, then a connected external one,
  then any linked one (same rule as Solana; no email needed). An external one signs through
  `createExternalEvmSigner` (`src/session/evm-signer.ts`, tested): switches the wallet to the typed
  data's chain, then `eth_signTypedData_v4`; one request at a time (two networks never switch under
  each other's prompt); `sendTransaction` for the admin's own transaction. Reconnection is
  `useConnectedWallet` in `privy-session.tsx`, shared by both ecosystems ("Reconnect your wallet to
  confirm.").
- **What Privy does (seen 2026-10-12)**: `createOnLogin: "users-without-wallets"` works per
  ecosystem in practice: a MetaMask login also got a **Solana embedded wallet**, so that account's
  primary network is Solana and it sees every network (Solana through the embedded wallet, EVM
  through MetaMask). Whether a Phantom/Solflare login gets an Ethereum embedded wallet the same way
  is still to be checked.
- **Primary network** (`primaryNetworkOf` in `network.ts`, used by `createKotiziClient` and the
  router): the default network for an account with a Solana wallet, else the EVM home network
  (`NEXT_PUBLIC_EVM_HOME_CHAIN`, default the first of `NEXT_PUBLIC_EVM_CHAINS`; use a fast one,
  e.g. 421614). `Session.address` = the account's address there (Solana first, else EVM); `/verify`,
  `IdentityGate`, `getKyc`, balances and the test helpers follow it without screen changes.
- **Admin**: `KotiziClient.adminNetworks` (router): every network where one of the account's wallets
  is the admin and can pay the fee (`Network.walletPaysFees`: false on Tempo, fees in pathUSD).
  `useIsAdmin` = any; `useAdminNetworks` feeds a **Network** picker on `/admin/groups/new` (shown with
  2+ networks; the confirmation names it). `CreateGroupInput.network` routes the creation;
  `EvmKotiziClient.createGroup` checks the contract's limits, the admin's wallet sends `createGroup`
  and pays the gas, the app waits for the receipt (viem public client on the chain's RPC) and reads
  the id from `GroupCreated`. No gas → `NotEnoughSol` ("The admin account doesn't have enough to pay
  the network fee"). **Tested in the browser** with the admin key in MetaMask (2026-10-12).
- Backend wallet cache: the backend caches a user's linked wallets for 30 s
  (`backend/src/auth/privy.ts`), so right after a MetaMask login the new Solana embedded wallet was
  missing there and `/v1/kyc` answered `400 no_wallet`. Frontend fix: `api.ts` retries `no_wallet`
  and `not_user_wallet` every 3 s for up to 35 s (both are refused before anything is sent).
  **Teammates (backend)**: don't cache a list that lacks the requested wallet.
- `/admin/groups/new/page.tsx` is a server page with `export const instant = false` around
  `CreateGroupView` (`@/features/admin`): the admin layout's `false` doesn't cover the page segment, and Next's dev
  overlay flagged it.
- Users on MetaMask see a network-switch prompt and up to three signatures to join (join, permit,
  pay); email login stays the recommended path.

**Creating EVM groups outside the app (2026-10-12; fallback).** The app now creates EVM groups from
`/admin/groups/new` (see above), except on **Tempo** (fees in pathUSD, which MetaMask can't pay):
there, `cast`. On the EVM networks `createGroup` accepts only the deployer/admin
`0x3C351A4be56878fd10fc7b605dd97fb139d72268` (immutable in `Kotizi.sol`, the `kotizi-deployer`
key). From a block explorer:

```
 Admin key (0x3C35…2268, from the teammate who deployed)
        │
        ├── Tempo Moderato? ──yes──► cast wallet import kotizi-deployer --interactive
        │                            cast send <Kotizi> "createGroup(...)" … --account kotizi-deployer
        │                            (fees in pathUSD: MetaMask can't pay them)
        no
        ▼
 MetaMask: Import account (private key) → check the address is 0x3C35…2268
        ▼
 Add the testnet (chainlist.org with "Include Testnets", or a custom network with evm/chains.json)
        ▼
 Explorer → Contract → Write Contract → Connect to Web3 (MetaMask, on the explorer, not localhost)
        ▼
 createGroup(name, uri, quota, maxMembers, period, adminFeeBps) → Simulate → Write → confirm
        │                                   (Unauthorized = wrong account)
        ▼
 New groupId = groupCount − 1 (Read Contract) or the GroupCreated event
        ▼
 App: "Sign in with email" → the group shows within ~20 s at /groups/evm-<chainId>-<groupId>
```

Fields: `name` ≤ 32 bytes; `uri` = `<app origin>/metadata/<slug>.json?value=<property USD>` (≤ 200
bytes; `localhost` only shows the property on this machine); `quota` = value ÷ shares with 6
decimals; `maxMembers` 2–64; `period` in seconds (`300` = 5 min, `86400` daily, `2592000` monthly);
`adminFeeBps` ≤ 1000 (`200` = 2%). The admin holds ~0.006 ETH per network (checked 2026-10-12);
`createGroup` costs 167k gas (693k on Ethereum Sepolia, 1.56M on Tempo). Example groups (each
installment fits the 10,000 USD daily EVM faucet):

| Network | Write Contract | name | uri slug & value | quota | shares | period | fee |
|---|---|---|---|---|---|---|---|
| Arbitrum Sepolia 421614 | [arbiscan](https://sepolia.arbiscan.io/address/0xF72Ee7E6901ab8ec3c8E5ADc44A8f2364C7F4B76#writeContract) | Casa Ipê Demo | `casa-ipe` · 200 | `100000000` | 2 | 300 | 200 |
| Base Sepolia 84532 | [basescan](https://sepolia.basescan.org/address/0x95fd2AbC6b37Ac56F07C7C408CD52a94b09e46e4#writeContract) | Porto Novo Lofts | `porto-novo` · 60000 | `5000000000` | 12 | 2592000 | 150 |
| Ethereum Sepolia 11155111 | [etherscan](https://sepolia.etherscan.io/address/0x054E6521B0Da1515fE78dEbF6908c93962456DFb#writeContract) | Studio Pinheiros | `studio-pinheiros` · 72000 | `3000000000` | 24 | 2592000 | 200 |
| Robinhood testnet 46630 | [blockscout](https://explorer.testnet.chain.robinhood.com/address/0xF72Ee7E6901ab8ec3c8E5ADc44A8f2364C7F4B76?tab=write_contract) | Brisa Mar | `brisa-mar` · 84000 | `7000000000` | 12 | 86400 | 100 |
| Tempo Moderato 42431 | `cast` (below) | Mar Azul Flats | `mar-azul` · 120000 | `6000000000` | 20 | 2592000 | 200 |

```bash
cast send 0xF72Ee7E6901ab8ec3c8E5ADc44A8f2364C7F4B76 "createGroup(string,string,uint64,uint8,uint64,uint16)" \
  "Mar Azul Flats" "http://localhost:3000/metadata/mar-azul.json?value=120000" 6000000000 20 2592000 200 \
  --rpc-url https://rpc.moderato.tempo.xyz --account kotizi-deployer
```

The Casa Ipê Demo (2 shares, 5 min) is the one for testing EVM "Draw now" with two of our own
email accounts. Network details for MetaMask (RPC, chain id, explorer) are in `evm/chains.json`.

Outside the frontend, for the submission: a deployed app needs `NEXT_PUBLIC_EVM_CHAINS` and the
deployed backend the `EVM_*` variables.

## IDL and the generated client

The IDL is generated from the program with Anchor, without touching the Rust code (the team
agreed, 2026-10-11). From the monorepo root:

```bash
PATH=$HOME/.cargo/bin:$PATH NO_DNA=1 anchor idl build -p kotizi -o target/idl/kotizi.json
```

- Needs Rust (via mise here) and Anchor CLI 0.32.1 (`~/.cargo/bin/anchor`). Put `~/.cargo/bin`
  first in `PATH` so rustup honours `rust-toolchain.toml` (1.89.0); the mise shim would pick the
  global Rust. No Solana CLI needed: it compiles on the host with the `idl-build` feature.
- `target/` is gitignored by the root `.gitignore`, so the IDL is **not versioned**: regenerate it
  locally. Versioning it is the program team's call (root `.gitignore`). Check `git status`
  afterwards: nothing tracked should change (`Cargo.lock` included).
- `bun run codegen` (defaults to `../target/idl/kotizi.json`) writes `src/chain/solana/generated/`,
  which **is committed**. `bun run devnet:check` (`scripts/devnet-check.ts`, read-only) decodes
  every live program account and simulates each user-facing instruction against the deployed
  program; it fails on anything but success or one of the program's own checks.
- The devnet deploy matches the source on `develop` (prize ledger included). Codama can't derive
  PDAs whose seeds read fields of other accounts (`group`, `membership`): pass them explicitly
  (`findMembershipAddress` in `pda.ts`).

## Solana client (`NEXT_PUBLIC_CHAIN_CLIENT=solana`)

`src/chain/solana/client.ts` = `SolanaKotiziClient` (done 2026-10-11), built by
`createKotiziClient({ signer, getAccessToken })` (`src/chain/index.ts`; `ChainProvider` passes
both from the session). The mock stays the default.

- **Reads**: groups and shares from the backend API (`/v1/groups`, `/v1/groups/:address`,
  `/members`, `/v1/me` for the user's shares joined with `/members` for `totalPaid`), converted in
  `solana/views.ts` (bitmaps rebuilt from index lists, prize ledger from `winners`). **Identity
  records and USDC balances come from the RPC** (user decision: full data, no login): the
  generated `fetchMaybeKycRecord` and the wallet's ATA. Metadata from `Group.uri`.
- **Writes**: Codama instructions sent through `relayInstructions`. Accounts a transaction
  depends on are read on chain first (`fetchGroup`, `fetchMembership`), never from the backend's
  3 s read cache. `join_group` uses the sponsor as `payer`, a fresh `asset` keypair and
  `findMembershipAddress(group, membersJoined)`; with `payFirstQuota` the same transaction adds the
  idempotent ATA creation (paid by the sponsor) and `pay_quota`. `claim_prize` needs the
  organizer's ATA to exist (the relay only creates the user's). No session wallet, or a wallet
  other than `owner`, → `SessionExpired`, nothing sent.
- **Confirmed writes over stale reads**: right after a payment or claim, the backend can still
  answer from an RPC node a few slots behind. The client applies its own confirmed `pay_quota`
  (including join + first quota) and `claim_prize` over the groups it reads (`withConfirmed`) until
  the backend shows them, the round moves on, or 30 s pass, so a screen never offers to pay or
  claim twice. A confirmed join is applied the same way for its 30 s: the group counts it and the
  user's share lists and the group's member list include it (`joinedHere`), so the screens after it
  never show "no share yet" or the spot still open.
- **Errors**: backend 5xx and RPC 429/5xx → `ServiceUnavailable` (not "transaction failed": reads
  hit it too); unreachable network → `NetworkError`. `getGroup` returns null for a string that
  isn't an address without asking the backend, and `useGroup` stops polling a group that doesn't
  exist (`useChainQuery`'s `pollWhile`).
- **Prize and stalled rounds** (user decisions, 2026-10-11): the credit is shown as the credit
  value (`creditValue`, superseding the earlier "up to" prize; see "Consórcio alignment"; the
  real prize is the round's paid pool minus the admin fee). When every share that joined has already won, the due round can't be drawn until a new
  member joins and pays (`waitsForNewMembers`): the UI says "Waiting for new members" instead of
  naming the shares that haven't paid (`awaitingInstallment` + `formatShares`: "Waiting for share 002
  to pay"), and still lets shares pay.
- **Draws**: `drawNow` → `POST /v1/groups/:address/draw`. **Identity**: `verifyIdentity`
  → `/v1/kyc`. **Demo onboarding**: `testing.fundUsdc` → `/v1/faucet` (fixed amount, once a day → `FaucetLimit`).
- **Identity verification (KYC)** is not account creation (the account is the Privy login): it
  gates joining a group. `join_group` needs the member's `KycRecord` (PDA `["kyc", wallet]`),
  created by `approve_kyc`, which only the KYC authority (a team key) signs. Built 2026-10-11 (user
  decisions). **Who verifies** (`requiresIdentityCheck`, `src/session/identity-check.ts`): a **new
  Privy account** always goes through the form once (even if its wallet already has a record), and
  **any account whose wallet has no `KycRecord`** too (e.g. one that left the form halfway). While
  the record is unknown (loading, failed read) only a new account waits; `join_group` still
  enforces it on chain. "New" is Privy's `isNewUser` from `useLogin`'s `onComplete` (only on a real
  login, not a restored session), kept in `sessionStorage` until the form is done. Privy also fires `onComplete` (`wasAlreadyAuthenticated: false`, same `isNewUser`) whenever one of its modals closes after a login, so `markLogin` records each account (Privy user id) once per tab and ignores repeats; sign out clears it. Once the form succeeds, `completeIdentityCheck` also marks the account verified in this tab (`Session.identityVerified`), so a read from an RPC node a moment behind can't send it back to /verify. `Session`
  exposes `isNewAccount` (null in the mock or a restored session), `newAccountPending` and
  `completeIdentityCheck()`. `useIdentityCheckRequired()` (`components/shell/identity-gate.tsx`)
  combines it with a settled `getKyc` read; `IdentityGate` in `(app)/layout.tsx` sends to
  `/verify?next=…` (`src/app/verify/`), the landing sends new accounts there directly. While the
  answer is still unknown (right after login: no wallet yet or the read pending) the gate shows
  `ScreenLoading` instead of the screen, so the app never flashes before /verify; a failed read
  doesn't hold it. The mock has
  no account store, so its fresh wallets go through the "no record" rule. After approving,
  `/verify` waits for a fresh read showing the record before leaving, then shows "Your identity is verified." with a "Go to home" (or "Continue") button; it never redirects on its own. Identity records and USDC balances are read at `confirmed` ("finalized" lags ~15 s on devnet and made the gate bounce back). The form
  (full name, CPF (only, masked `000.000.000-00`; other documents only if the product owner asks), date of birth; checks in `src/lib/identity.ts`: 18+, and any 11-digit CPF passes in the demo, user decision 2026-10-11, since a real provider checks it) is a labelled
  **demo**: validated in the browser, never sent or stored; `KotiziClient.verifyIdentity(wallet)`
  (main interface; mock mirrors it) asks the backend's KYC mock (`POST /v1/kyc`, `KYC_MODE=auto`),
  which only receives the wallet. `kyc_unavailable` (501, `KYC_MODE=off`) →
  `IdentityVerificationUnavailable`. The join screen and the account menu link to `/verify` while
  the identity is pending. Document upload: later. A real provider is on the roadmap. `isNewUser`
  is client-side: it only picks the screen; if the backend ever needs it, ask Privy server-side.
- **Test helpers never on mainnet** (user rule, 2026-10-11): the checkout's deposit, failure
  simulation and the other `testing` helpers are read only through `useTestHelpers()`
  (`src/chain/use-test-helpers.ts`), never `client.testing` directly. It returns them only once
  `KotiziClient.isTestNetwork()` answers true (Solana: the RPC's genesis hash isn't mainnet-beta's,
  the same check that refuses to send there; mock: always true); hidden while unknown or on error.
- **Checkout, no balance** (user decision, 2026-10-12; replaces "Add balance"): the app keeps no
  balance and shows none (account menu, sidebar, join screen and payments have no balance rows; no
  "Add balance" or "Insufficient balance"). Money comes in with each payment: `CheckoutDialog`
  (review → "Pay with" Bank transfer / Pix / Crypto → that method's instructions → "Confirm
  payment"/"Confirm and join" → "Confirming your payment…" → the action's own toast). The methods
  and their mock data (bank details, decorative non-scannable Pix QR + copy-and-paste code, crypto
  rows with the group's network) live in `checkout/deposit-methods.tsx`, with no demo labels (user
  decision, 2026-10-11). On test networks the deposit is `testing.depositShortfall({ owner, target,
  amount })` (`KotiziRouter`): on the network of the group/share, it adds only what the account's
  wallet there lacks (`fundUsdc(wallet, shortfall)`; null when the wallet covers it, then nothing is
  deposited). The mock credits exactly the shortfall; the Solana backend faucet mints its own fixed
  `FAUCET_AMOUNT_USDC` once per wallet per day, so a second deposit the same day shows "Deposit
  limit reached" (`FaucetLimit`: "Deposits are limited to one a day"). Nothing to pay now (a join
  during a draw) or no test helpers → a plain confirmation. The receipt on `/payments` says "Paid
  with <method>". **Pending (teammates, backend)**: faucet amount = the requested shortfall and no
  daily limit on test networks, or pay-at-checkout breaks on 1-minute demo groups after the first
  deposit of the day. The mock-only helpers stay under "Test helpers" in the account menu.
- **Route guards** (user rule, 2026-10-12): every screen under `(app)/` is for signed-in accounts only.
  `AuthGate` (`components/shell/auth-gate.tsx`, around the whole shell in `(app)/layout.tsx`) sends a
  signed-out visitor to the landing page and renders nothing of the app; while the session loads the
  screens render with their own placeholders (keep it that way: Next's prerender and instant-navigation
  check see a loading session, and a gate that hides the page then makes Next drop the segment). `AdminGate` (`features/admin`, used by `(app)/admin/layout.tsx`)
  sends any account that isn't the admin (`useIsAdmin`, read only once the session is signed in) to `/home`;
  it holds a placeholder until then, so that layout sets `export const instant = false`. `/verify` already sends a signed-out
  visitor to `/`. Client-side guards (Privy's session lives in the browser); the chain and the backend
  enforce the real rules.
- **Sign out** (2026-10-11): always through `useSignOut()` (`components/shell/use-sign-out.ts`),
  never `session.logout` directly. It sets a "signing out" flag (`useSigningOut`), goes to the
  landing page, awaits `Session.logout()` (async; also clears the identity check), then clears the
  selected share (`clearSelectedShare`) and every cached chain read (`resetChainCache` in
  `chain/hooks.ts`). While the flag is on, the app's screens (`IdentityGate`), the sidebar account
  card and the mobile bar show placeholders instead of their signed-out state, and the landing page
  doesn't send the still signed-in session back to /home; the landing clears it (`endSignOut`)
  once the session is signed out (a failed logout clears it too). Ordered by state, not timing:
  Privy's logout can finish before or after the navigation. Entry points: a visible
  "Sign out" button in the sidebar's account card, the account menu (sidebar "Account" and the
  mobile avatar) and `/verify`.
- Tests: `solana/views.test.ts`, `solana/client.test.ts` (fake backend and RPC with accounts
  encoded by the generated encoders).
- Notes for the team: the devnet group's `uri` points at `example.com`, so no property metadata
  shows; the seed should use e.g. `<app origin>/metadata/porto-novo.json?value=500`.

## Local testing (localnet)

The devnet program's authorities (admin, KYC, test-USDC mint) are a teammate's key, so to test the
whole flow with your own keys run a local copy of the program (nothing in the Rust code changes;
everything below writes only gitignored files). Tools: Rust (mise), Anchor CLI 0.32.1 and Solana
CLI (Agave) in `~/.cargo/bin` and `~/.local/share/solana/install/active_release/bin`.

1. Build: `NO_DNA=1 anchor build -p kotizi` at the monorepo root (`target/deploy/kotizi.so`).
2. Your authority: `cd scripts && npm install && npm run codegen && npm run keygen`
   (`scripts/keypairs/authority.json`, prints only the address).
3. Validator: `solana-test-validator --reset --mint <authority address> --bpf-program
   FGSa94mooAstAWBcevwvRSY8QFXakiidJkecCDWpnG1n target/deploy/kotizi.so --bpf-program
   CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d tests/fixtures/mpl_core.so` (no ORAO locally:
   slot-hash draws only).
4. Seed: `RPC_URL=http://127.0.0.1:8899 JOINED=2
   GROUP_URI='http://localhost:3000/metadata/porto-novo.json?value=500' npm run seed` (config, test USDC,
   a group with 3 open shares).
5. Backend (`backend/.env`): `RPC_URL=http://127.0.0.1:8899`, the three keypairs pointing at
   `../scripts/keypairs/authority.json`, `KYC_MODE=auto`, `FAUCET_ENABLED=true`,
   `KEEPER_ENABLED=true`; `npm install && npm run codegen && npm run dev` (codegen needs
   `scripts/node_modules`).
   The backend keeps faucet limits in `backend/.pglite`: after a validator `--reset`, move that
   folder aside or the faucet answers "once a day" for a wallet the new ledger never funded. Keep
   the validator ledger on a real disk, not a tmpfs `/tmp` (it grows past 1 GB and the validator
   panics with "Disk quota exceeded").
6. Front (`.env.local`): `NEXT_PUBLIC_CHAIN_CLIENT=solana`, `NEXT_PUBLIC_API_URL`,
   `NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899`, `NEXT_PUBLIC_SOLANA_WS_URL=ws://127.0.0.1:8900`.
   `NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899 bun run devnet:check` works against it too.
   Explorer links in `OnchainDetails` still point at devnet.

## Own devnet deployment

To test on devnet with your own authorities, deploy a separate copy of the program under a new
program id. The front never regenerates `src/chain/solana/generated/` for it:
`NEXT_PUBLIC_KOTIZI_PROGRAM_ID` overrides the generated id (`KOTIZI_PROGRAM_ADDRESS` and
`PROGRAM_CONFIG` in `src/chain/solana/program.ts`; pass `PROGRAM_CONFIG` to every generated
instruction builder so its PDAs follow it). `bun run devnet:check` honours it too.

1. `anchor keys sync` at the monorepo root (writes the id of `target/deploy/kotizi-keypair.json`
   into `declare_id!` and `Anchor.toml`: **local only, never commit them**), then `anchor build`.
2. `npm run codegen` in `scripts/` and in `backend/` (both gitignored outputs, they read
   `target/idl/kotizi.json`).
3. Fund the authority (~5 SOL; the RPC airdrop is rate-limited, faucet.solana.com works), then
   `solana program deploy target/deploy/kotizi.so --program-id <program keypair> --keypair
   <authority>` (~2.3 SOL of rent).
4. Seed as in "Local testing" with `RPC_URL=https://api.devnet.solana.com`. The scripts' `send`
   resends the same signed transaction after a 429 or a dropped websocket, so it can report
   "already been processed" for a transaction that landed: check the chain before re-running
   (each run creates a new group). Name and `uri` are fixed once a group exists, so give each
   demo group its own `GROUP_NAME` and a property of `src/content/groups.ts` with its credit as
   `?value=` (e.g. `GROUP_NAME="Casa Serra Demo"`, `GROUP_URI='<origin>/metadata/casa-serra.json?value=500'`).
5. Backend and front as in "Local testing" with the devnet RPC/WS, plus
   `NEXT_PUBLIC_KOTIZI_PROGRAM_ID`. **Use a dedicated devnet RPC** (e.g. Helius,
   `https://devnet.helius-rpc.com/?api-key=…`) for `RPC_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL` and the
   seed: the public `api.devnet.solana.com` rate-limits in bursts (429), which failed payments and
   left screens loading during the 2026-10-11 tests. The front's key ends up in the browser, so
   restrict it to the app's domains. On the public RPC keep `KEEPER_INTERVAL_MS` around 15000.
   **Pending (2026-10-11, decision deferred):** front and backend share one Helius key, and the
   backend's `GET /v1/config` also returns its `rpcUrl` with the key. Options: restrict the key by
   origin and give the backend its own key; or the front on the public devnet RPC (limits are per
   user IP; risky on a shared network during the demo) with the backend on Helius; or a Next route
   handler proxying only `getAccountInfo`/`getLatestBlockhash`/`getGenesisHash` (WS stays public).

Going back to the team's program means restoring `declare_id!`/`Anchor.toml`, rebuilding and
re-running both codegens.

## Consórcio alignment (pending, 2026-10-11)

Goal: make the journey match how a real consórcio works. Where each part fits: what changes how
much money moves, when or to whom is on-chain; what only changes how it is presented is frontend.

Today the program already works like a consórcio in these ways: fixed number of shares, the same
quota for everyone, one draw per period with verifiable randomness, each share wins once, unpaid
shares aren't eligible, winners can keep paying, and the share is a transferable NFT. It differs
here:

**On-chain (program team; changes the IDL, then `bun run codegen`, `types.ts`/`derive.ts` and a
redeploy):**
- Fixed credit value: `credit_amount` on `Group`, always paid in full. Today the prize is what
  was paid in that round, so it is smaller while the group isn't full or a share didn't pay.
- Admin fee and reserve fund inside the installment (installment = (credit + fee + reserve fund)
  / term). Today the fee is taken from the prize in `claim_prize`.
- Forming → active status: draw only once the group is full. Today `request_draw` runs with
  empty shares.
- Winners must keep paying, plus default handling (block, penalty or reserve fund). Today a
  winner can stop paying.
- Bids (lance).
- Use the credit to buy the property (pay a seller or an escrow, not the member). Today the prize
  is paid in USDC to the share's owner.

**Backend (team):**
- After the program changes: the new fields in `GroupView` (credit, reserve fund, forming status)
  and keeper rules that follow them.
- Possible now, no program change: index the events the program already emits (`QuotaPaid`,
  `MemberJoined`, `DrawSettled`, `PrizeClaimed`) into a route such as
  `GET /v1/groups/:address/activity`, for payment history and share activity (today shown as out of
  scope).
- Keeper policy of not drawing a group that isn't full: only a convention, `request_draw` stays
  permissionless.

**Frontend (can be done alone, on the current program):**
- Consórcio vocabulary and journey, in English with a gloss: credit value, installment, term,
  assembly, contemplated.
- Choose by credit value: the group card and the join screen show "credit X · N months ·
  installment Y". Credit = `creditValue` (`quotaAmount × maxMembers`, the fee is deducted at
  release); term = `maxMembers × periodSecs`.
- Transparency: the admin fee in % and in total over the group's life, and a notice when the
  credit will be smaller (group forming or unpaid installments).
- Winner screen: says the installments must keep being paid and shows how many are left
  (`quotasLeft`).
- Share timeline: installments paid and left, contemplation (from current state; detailed history
  waits for the backend's event indexing).
- Property value: show `propertyValueUsd` (already in the group metadata, not shown anywhere) and
  align the content so the credit matches it.
- Bids and "use the credit to buy": roadmap, never shown in the UI. **No roadmap or future-feature
  copy anywhere in the UI** (no "Coming soon", no "on the roadmap"; user decision, 2026-10-13): the
  roadmap lives in the docs and the pitch.
- The mock may simulate the new rules ahead of the program only if clearly labelled; it must not
  pass off as working what the chain doesn't do.

Recommendation for the deadline: the frontend part only; event indexing is the cheap backend
win; the on-chain list goes into the pitch as roadmap.

**Vocabulary** (decided 2026-10-11): the UI uses consórcio terms: credit value, installment,
term, contemplated (the event stays "draw", the button "Draw now"). Code names (`quotaAmount`,
`prize`, `round`) stay. "Credit value", never "credit letter" (user decision, 2026-10-12: copy, code
and docs; `creditValue`/`creditValueFee` in `derive.ts`).

**Done (step 1, 2026-10-11):** group card, `/groups`, group detail and join screens. Credit
value = `creditValue` in `derive.ts` (quota × shares, gross; matches `propertyValueUsd`), admin
fee = `creditValueFee`, the net shown as "Released when contemplated" (`fullRoundPrize`).
`FormingNotice` (`components/group/forming-notice.tsx`, with `isForming`/`formingRoundPrize`)
says a draw releases less while the group fills or a share misses an installment. The group detail
shows the property value from the metadata; the join checkbox states that installments continue
after contemplation.

**Done (step 2, 2026-10-11):** the credit screen breaks the amount down (credit value, collected
in draw N, admin fee, you receive; a note when the draw collected less than the credit value), shows an
"Installments continue" card with `quotasLeft`. Home has "Your share's path" (`components/share/share-journey.tsx`: joined,
installments paid, contemplated in draw N via `contemplatedInDraw`, installments left, group end)
and its copy uses installment/contemplated.

**Done (step 3, 2026-10-11):** consórcio vocabulary on payments, draws, `PayQuotaButton`, error
messages (`errors.ts`), landing, metadata description and content. Installments are numbered per
share (`currentInstallment`/`installmentsTotal` in `chain/share.ts`: "Installment 1 of 5" for a
late joiner), never by the draw number. Draws show "Collected for this draw" / "Credit released"
(the "Bid to be contemplated · Coming soon" card was removed on 2026-10-13, with the /verify
"identity provider is on the roadmap" note). The frontend list is complete; what's left
needs the backend (event history) or the program.

**No withdrawal: the credit goes to the property (user decision, 2026-10-11):** the UI never
calls `claim_prize` (on-chain it would pay the USDC to the member). A contemplated share's credit
stays in the group vault and the UI says it "will be sent to the company responsible for the
property": the credit screen is "Credit reserved" (path: contemplated → reserved in the group
vault → sent to the company responsible for the property, pending), home and draws link to it
with "See my credit", and the group detail says the same. Sending it to the company is roadmap
(it needs the program: credit paid to a seller/escrow). `claimPrize` stays in `KotiziClient`, the
mock and the Solana client, unused by the UI; shares claimed earlier keep their receipt.

## UI rules

- **Abstract crypto in the UI**: amounts are labelled "USD" (the token is still USDC on-chain;
  internal names like `formatUsdc` stay); no wallet addresses on screen; say
  "account"/"balance"/"confirm" instead of "wallet"/"sign"; "identity verification" instead of
  "KYC". Transaction hashes, the group contract and the randomness proof live only inside the
  collapsed `OnchainDetails` panel. (`WalletChip` was removed as dead code on 2026-10-22.) The network
  ("Solana devnet"/"Solana localnet"/"Simulated", `getNetwork(group.network).name` in
  `src/chain/network.ts`) is the first row of `OnchainDetails`, the only place the UI names it.
- **Error boundaries** (Next 16 file conventions; props `error` + `retry`, preferred over
  `reset`): a failed chain read is `LoadError` inside the screen; a screen that throws while
  rendering falls to `(app)/error.tsx` (inside the shell, so the sidebar still navigates away),
  `app/error.tsx` (landing, `/verify`) or `app/global-error.tsx` (replaces the root layout: its own
  `<html>`/`<body>`, `globals.css` and `fontVariables` from `app/fonts.ts`, no providers). "Try
  again" calls `invalidateChain()` before `retry()` (chain reads are a client cache that `retry`
  doesn't refetch). `role="alert"`; never show `error.message`. `app/error.tsx` has no "go to the
  start page" link: on the landing it loops back to the broken page.
- **Brand** (team brandbook, not in this repo): dark mode is the standard (60% graphite `#171717`,
  30% Kotizi blue `#0000FF`, 10% lavender `#B6B6F0` + white); Archivo for text, IBM Plex Mono for
  figures, amounts and statuses; one highlighted number per screen; brand name always lowercase
  (`kotizi`). Tokens live in `src/app/globals.css`.
- **Screens** (from the team's design handoff): routes `/`, `/home`, `/groups`,
  `/groups/[id]`, `/groups/[id]/join`, `/groups/[id]/credit`, `/payments`,
  `/draws`; screens in `<route>-view.tsx` files, design system pieces in `src/components/kz/`. Not implemented, pending decisions:
  pt-BR/i18n, BRL, the handoff's program model (fixed credit, 120 shares, crank payout, Round
  account). The draw screen has one "Draw now" button (the keeper also draws on its own). Shown
  as out of scope: Pix, autopay, payment history / on-chain activity, "use for purchase" / "withdraw
  via Pix".
- **Screen states** (from the journey review, 2026-10-11):
  - Toasts sit bottom right (`providers.tsx`), clear of screen titles; below lg 100 px up, above
    the tab bar (`mobileOffset` covers ≤ 600 px, a `globals.css` rule the widths up to 1024 px).
  - `html` has `color-scheme: dark` (native date picker, scrollbars), and autofilled inputs keep
    the field's surface and text (`globals.css`) instead of the browser's light fill.
  - Privy's modal uses the graphite background (`appearance.theme: "#171717"`).
  - "Open groups" (`OpenGroups`) lists only groups with an open spot (`isForming`); the term
    filter only shows with more than one term. Low-value test groups (the 500 USD "Casa Kotizi
    Demo" on every network, the 300 USD Casa Ipê) are hidden by id (`HIDDEN_GROUP_IDS` in
    `open-groups.tsx`; user decision, 2026-10-13, so no contract is redeployed); their pages and
    existing shares still work.
  - While the session is "loading" or signing out, the sidebar's account card is a skeleton and
    the mobile top bar shows no "Sign in".
  - After a join, the new share is selected (`selectShare`), so "Go to home" opens on it.
  - Group detail: a member gets "Go to my share" (selects it, `selectShare`, and opens home);
    "Take another share" is secondary; "Group is full" only for non-members.
  - Share grid: taken-but-unpaid shares are filled (`bg-control`), open spots dashed, numbers as
    `formatShare` ("005"), legend swatches 16 px.
  - Home draw card: a contemplated share shows its own number, a "Contemplated" badge and the
    amount; otherwise "N eligible share(s)" (`plural` in `lib/format.ts`).
  - Loading: `ScreenLoading` (`kz/screen.tsx`) for a screen whose content isn't known yet;
    `GroupLoading` mirrors the group screen's two columns.
  - Layout shift (Lighthouse, 2026-10-22): a skeleton has the height of what replaces it (sidebar
    account card 164 px, group card 204 px) and holds the place of anything that only shows after
    the data (the "Term in installments" filter). Home's "Open groups" renders only once the shares
    above have loaded (`useSharesSettled`), else they push it down. The shell's content is the page's `<main>`.
  - `useNow` (1 s clock) goes in the smallest component that shows time (home: `NextSteps`,
    `DrawCard`), never at the top of a screen, so the rest doesn't re-render every second.

## Design system

Implemented from the team's Figma "Kotizi — Design System · Átomos" (dark mode only; the Figma
copy is in Spanish, the UI stays in English; some values were read from screenshots and are
estimates):

- *Selección*: `focus-ring` utility (2 px lavender outer ring; use it on every interactive
  element), `kz/chip.tsx` (used by `SegmentedPills` and `ShareSwitcher`), `ui/checkbox.tsx`.
  The selected share (`useSelectedShare`) is shared by home, payments and draws and kept in
  `sessionStorage`.
  Radio and switch are not built (no screen needs them).
- *Botones y links*: `ui/button.tsx` variants `primary` (Kotizi blue, the main CTA), `secondary`
  (outline), `ghost`, `inverse` (white, only on blue surfaces or over the light); sizes
  `sm`/`md`/`lg`/`xl` = 32/40/48/56 px; `IconButton` (`icon-md`/`icon-lg`, `aria-label`
  required); `kz/text-link.tsx` (`TextLink` + `textLinkVariants`).
- *Campo de texto*: `ui/input.tsx` (40/48 px, error via `aria-invalid` with an alert icon,
  optional leading `icon`).
- *Indicadores*: `ui/badge.tsx` (`tone` neutral/blue/info/success/warning/danger × `variant`
  subtle/solid, mono uppercase), `kz/user-avatar.tsx` (initials from the email, icon when there
  is none), `ui/progress.tsx` (`sm`/`md`), `kz/step-marker.tsx` (`ui/separator.tsx` removed as unused, 2026-10-22: re-add it with shadcn if a screen needs one).
- *Íconos*: lucide stays (the 25 design-system icons exist there); a global `svg.lucide` rule sets
  a 1.5 px stroke, square caps and miter joins. Keep that selector plain: the production build
  silently drops `:where(svg.lucide)`. The icon set is still a proposal.
- *Marca*: `<Luz variant="page" | "card">` (`kz/luz.tsx`, blurred light + grain from the
  `--grain` token; keep its bright core away from text), grain also on `card-plano`
  (`kz/brand-module.tsx`, unused, was removed on 2026-10-22). Logo:
  white on blue/graphite, blue or graphite on light backgrounds.
- *Grilla*: `page-grid` utility (12 columns, 24 px gutter, margins 64/80/96 at 1024/1440/1920;
  4 columns below 1024), used only on the landing page. 8 pt base for heights.
- *Efectos y gradientes*: `shadow-elevation-1/2/3` (1 cards at rest, 2 menus/popovers, 3
  modals), `vidro` (24 px blur, 16% white stroke), `bg-luz-diagonal` and `bg-luz-profunda` for
  crisp UI gradients (brand pieces always use the blurred `<Luz />`).
- *Color*: primitive scales (`--blue-*`, `--gray-*`, `--green/red/amber-*`, alphas) are raw
  values only; components use the dark semantic tokens through per-property namespaces that keep
  the Figma names: `bg-canvas/surface/surface-raised/brand/brand-hover/brand-pressed/brand-subtle/
  hover/pressed/disabled/control/*-subtle`, `text-primary/secondary/tertiary/disabled/inverse/
  on-brand/on-status/brand/brand-hover`, `border-subtle/default/strong/brand/focus/error`,
  `ring-default/focus/subtle/inverse`, status `success/error/warning/info`. Use `text-primary` on
  graphite and `text-on-brand` on blue; the logo stays `text-white`. Brand palette names
  (`lavender`, `kotizi-blue`, `deep-blue`, `mist`, `graphite`) remain. Deviations: `text-tertiary`
  = gray-400 and `text-disabled` = gray-500 (the Figma's darker values fail contrast). shadcn
  tokens (`--muted`, `--accent`, `--destructive`…) point at the semantics; the DS `bg/accent` isn't
  exposed (name clash), use `bg-lavender`. Light mode and `icon/*` tokens are not built.
- *Tipografía*: `type-*` utilities with the Figma values (`type-display`, `type-h1`…`h5`,
  `type-body-lg/md/sm`, `type-label-lg/md/sm`, `type-mono-caption/overline/micro`,
  `type-data-lg/md/sm`, `type-firma`, `type-firma-light`). They are utilities, not `--text-*`
  sizes, because `cn` drops a theme size followed by a text color. Screen titles use `type-h3`,
  section titles `type-h5`; **highlighted amounts are Plex Mono** (`type-data-*`); `label-mono` is
  Mono/Micro in `text-tertiary`. Button, Chip and TextLink keep the sizes from their own DS pages.
- *Espaciado, radios y tamaños*: spacing matches Tailwind's 4 px scale. The radius scale replaces
  shadcn's: `rounded-xs/sm/md/lg/xl/2xl` = 4/8/12/20/24/32, `full` for pills; fields `md`, cards
  `lg` (`xl` for the large ones). Icons 16/20/24 (`size-4/5/6`).
- Shared surfaces: `ui/card.tsx` (`Card` + `cardVariants`: `surface`/`plano`, radius `lg`/`xl`,
  padding, `elevation-1` by default, `interactive`, `render` prop). `cn` can't merge custom tokens
  passed through `className`, so expose them as variants. Status labels use `Badge`, never plain
  text.
- Open: whether `card-plano` should become `bg-luz-profunda`.

## Hard rules

- Never commit, print or hard-code private keys, seed phrases or keypair JSON files. Use
  environment variables (`.env`, gitignored).
- Devnet/localnet only. Never target mainnet.
- Don't change the program or its IDL from frontend work without the team agreeing; the IDL is the
  frontend contract.
- Respect licenses of third-party code and note them in the README (hackathon rules §9).
- Ask before adding a new major dependency or making an architectural decision.

## How to work

- Prefer the smallest thing that works end to end over a broad, unfinished feature set. No fake
  stubs passed off as working features; if something is mocked for the demo, label it clearly.
- Judging criteria: functionality and code quality, impact, novelty, UX that uses the blockchain
  well, open source and composability, and business viability.
- Verify changes by running them (build, typecheck, the app) before reporting them as done.
