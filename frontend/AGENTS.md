<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# kotizi frontend: agent guide

kotizi is a tokenized real-estate **consórcio** (a ROSCA) on **Stellar** (Soroban, testnet only):
members join a group, pay a fixed quota each round into the contract, and each round one eligible
member is drawn and wins that round's pool. Each membership (share) is an NFT minted by the Kotizi
contract itself, so the share and the right to pay and claim move with it. This folder is the web
app; the contract is `../contract/kotizi`, the API is `../backend`. When this file and the repo's
own docs disagree, `../PLAN.md`, `../docs.md` (every contract function, error and event, with CLI
recipes), `../DEPLOYMENTS.md` and `../backend/README.md` win.

Hackathon: Stellar Meridian. The app was seeded from the Solana + EVM frontend of
`kotizi/colosseum-kotizi-monorepo` (`develop`, after its refactor); that repo is the reference for
product decisions, this one serves a single network: no multichain router, no network ids.

## Language

- Everything here is in **English**: code, identifiers, comments, UI copy, docs and commit
  messages (hackathon rules).
- Use the contract's English names in code (`Group`, `Membership`, `quota`, `draw`, `prize`).
- **"Share", never "cota"** (user decision, 2026-10-12): a member's place in a group (the membership
  NFT) is a *share* everywhere in the frontend, in copy, code, file names and docs (`MyShare`,
  `ShareSwitcher`, `formatShare`, `components/share/`). Not "quota": in the contract `quota` is the
  installment amount. Only names owned by others keep "cota": the backend's `cotas` field in `/v1/me`
  and the `no_eligible_cotas` reason, and the contract's `CotaNotFound` and `cota_owners`.
  "Consórcio" may still appear in docs and pitch with an English gloss.

## Stack and tooling

- Self-contained app with its own `package.json`; run every command from this folder. See
  `README.md` for structure and commands.
- **Next.js 16** (App Router, Turbopack, `cacheComponents` on), TypeScript, **Tailwind CSS 4**,
  **shadcn/ui** (`base-nova` style, built on Base UI: use the `render` prop, not `asChild`),
  **Privy** (`@privy-io/react-auth`), `@stellar/stellar-sdk` 17.2.1 (the backend's version, so both
  ends build the same XDR) and `@stellar/freighter-api` 6.0.1 (the admin's wallet). Both Stellar
  packages are for `src/chain/stellar/` and `src/session/` only.
- Prerender rules bite: no `Date.now()` or `usePathname()` outside `<Suspense>` in prerendered
  client components.
- **bun only**: `bun install`, `bun add`, `bun run`, `bunx`. Never npm, yarn or pnpm here, and
  never their lockfiles.
- Verify with `bun run quality` (lint, `tsc --noEmit`, unit tests, e2e) and `bun run build`. Unit
  tests (`src/**/*.test.ts`, `bun:test`, `bun run test` = `bun test src`) cover `derive.ts`, the
  mock's contract rules and small helpers; keep them passing. `tsc` needs Next's generated route
  types (`PageProps`, `LayoutProps`): run `bun run dev` or `bun run build` once in a fresh checkout.
  `build` and `dev` share `.next/`: don't build while a dev server is running (it ends up serving
  stale CSS); if it happens, restart it with `rm -rf .next && bun run dev`. Start the next dev server
  after a build the same way (a dev server started over a build's `.next/` once hung compiling
  `/payments`).
- **ESLint enforces the layers** (`eslint.config.mjs`, `no-restricted-imports`): `src/app/**`,
  `src/components/**` and `src/features/**` never import chain SDKs (`@stellar/*`), chain
  implementations (`@/chain/stellar/*`, `@/chain/mock/*`) or Privy (`@privy-io/*`, `@/session/privy-*`);
  they use the `@/chain` hooks and `useSession()`. `src/chain/**` (tests excepted) never imports
  `@/components/*`, `@/app/*` or `@/features/*`. A new block with `no-restricted-imports` for the same
  files replaces these patterns instead of adding to them: extend the existing `patterns`
  (`eslint.config.mjs` keeps them in `uiPatterns`; the design system block repeats them before its
  own). `@typescript-eslint/no-floating-promises` is on for every `.ts/.tsx` (type-aware,
  `projectService`): await, return or `void` every promise.
- **Domain rules live in `src/chain/`, never in components or hooks**: `derive.ts` mirrors the
  contract (group and share index), `share.ts` adds the rules about one share (`ShareRef` = group +
  membership: `quotaStatus`, `canClaim`, `installmentsPaid`, `installmentsTotal`,
  `currentInstallment`), each with its `*.test.ts`. Hooks only read (`use-my-shares.ts`: `useMyShares`,
  `MyShare extends ShareRef`). Copy built from those rules stays with the UI that shows it
  (`components/share/installment-label.ts`: "Installment 3 of 5" / "Installment for draw 4").
- **`components/` by role**: `ui/` (shadcn on Base UI) and `kz/` (kotizi's design system: `chip`,
  `field`, `screen`, `surface-list`, `plan-card`, `luz`, `vidro-k`, `timeline`…) are presentation only
  and take data through props; ESLint forbids them from importing `@/chain`, `@/session`, `@/content`,
  `@/config`, features, routes or any other `components/` folder. Product pieces live by subject:
  `checkout/` (`checkout-dialog`, `deposit-methods`, `network-fee-row`), `onchain/` (`onchain-details`,
  `tx-link`, `load-error`), `group/` (incl. `draw-digits`), `share/`, `shell/`, `brand/`.
- **Thin routes**: every `page.tsx` is a server component that only renders its screen, a
  `<name>-view.tsx` next to it (`HomeView`, `DrawsView`, `PaymentsView`, `GroupsView`, `ConnectView`
  for `/`, `GroupView`, `JoinView`, `CreditView`, `VerifyView`), or a view from a feature
  (`CreateGroupView`). Route-only concerns stay in `page.tsx`: awaiting `params` inside `<Suspense>`,
  `export const instant`. The view holds `"use client"` and the screen's components, so moving a
  screen into `src/features/` touches only its view and one import.
- **Feature folders**: `src/features/<name>/{hooks,components,index.ts}`; the rest of the app imports
  a feature only from its index (`@/features/<name>`; ESLint forbids `@/features/*/*`), and inside a
  feature imports are relative. Routes (`page.tsx`, `layout.tsx`) stay in `app/` and import from the
  feature. Only `admin` is migrated: `useIsAdmin`, `AdminGate`, `CreateGroupLink`, `CreateGroupView`;
  the other screens stay in `components/` until a feature is worth moving.
- **E2E** (Playwright, `e2e/`, `bun run e2e`; once: `bunx playwright install chromium`): starts its
  own `next dev` on port 5000 with the mock chain client and the mock session. The `setup` project
  (`auth.setup.ts`) signs in, fills `/verify` and saves `playwright/.auth/user.json`; specs start
  signed in (`login.spec.ts` opts out). Tests share no state: each joins first (`e2e/helpers.ts`:
  `joinGroup`, `drawNow`). Pick groups by name, never by id; query by role and accessible name, never
  by CSS. On a failure, read `test-results/<test>/error-context.md` (the page's aria snapshot) first.
  Assertions wait up to 15 s (`expect.timeout`): the dev server compiles each route on its first
  visit, and a `bun run build` empties its cache.
- Commits follow Conventional Commits (`feat(frontend): ...`).

## Contract scope the UI builds on

The Kotizi contract (`../contract/kotizi`, Soroban; ids in `../DEPLOYMENTS.md`, testnet only):

| Function | Who signs | What it does |
|---|---|---|
| `approve_kyc(wallet)` | KYC authority (backend) | records the wallet's identity approval (required to join) |
| `add_token(token)` | admin | enables a SEP-41 token groups can use (its decimals are stored) |
| `create_group(name, uri, token, quota, max_members, period, admin_fee_bps)` | admin | opens a group in one enabled token (2–64 shares, fee ≤ 10%, name ≤ 32 bytes, uri ≤ 200 bytes) |
| `join_group(group_id, member)` | member | takes the next share and mints its NFT (needs the identity approval) |
| `pay_quota(group_id, index)` | the share's NFT owner | pays this round's quota (once per round) |
| `request_draw(group_id)` | nobody (permissionless) | after the due date, fixes a future drand round |
| `settle_draw(group_id, signature)` | nobody (the drand signature is checked on chain) | picks the winner among paid, not-yet-won shares |
| `claim_prize(group_id, index)` | the winner's NFT owner | pays that share's prize (any round) minus the admin fee |

UI features: walletless login, browse and join groups (needs an approved identity), pay the quota,
"Draw now" (the backend's keeper also draws on its own), the credit reserved for the property (no
claim in the UI), the user's shares, and group creation for the admin (`/admin/groups/new`). Out of
scope (roadmap only): marketplace, bids, default handling, real KYC provider, property registration
(properties are the fixed `GROUP_CONTENT` list in `src/content/groups.ts`).

- **Randomness**: drand quicknet. `request_draw` stores a drand round about 30 s ahead
  (`Group.draw_round`); `settle_draw` verifies that round's BLS12-381 signature in the contract and
  derives the winner from it, so nobody (the keeper included) knows or steers the outcome. A pending
  draw can be requested again once its round is an hour old (drand down).
- **Per-share prize ledger**: one `Prize` entry per share that won, plus `unclaimed_bitmap` and
  `unclaimed_total` on the group. An unclaimed prize never blocks the next draw; a share claims in any
  round. `Paid(group, index)` keeps what each share paid in total.
- **A token per group** (admin allowlist, at most 8): quotas and prizes are in the group's token base
  units, and **decimals differ per token** (the demo test token has 6, the 7-decimal test token and
  Circle's testnet USDC have 7). Circle's USDC is a classic asset: every holder (members and the admin,
  who gets the fee) needs a trustline, which the app doesn't create. The backend faucet mints only its
  `FAUCET_TOKEN` (the 6-decimal demo token).
- **Storage TTL**: Soroban entries expire and get archived; the contract extends what it touches and
  the backend's relay simulation restores archived entries automatically.
- **Backend** (`../backend`, `backend/README.md`): Privy-authenticated reads (`/v1/config`,
  `/v1/groups[/:id[/members]]`, `/v1/me`), the gasless relay (`POST /v1/tx/prepare` +
  `POST /v1/tx/relay`), "draw now" (`POST /v1/groups/:id/draw`) plus a keeper, and demo onboarding
  (`POST /v1/kyc`, which also creates the wallet's ledger account, and `POST /v1/faucet`). Errors are
  `{ code, message }`; a contract failure is `422 contract_error` with the contract's error name.

## Auth and network fees

- **Walletless via Privy**: email login. Stellar is a Privy "extended chain"
  (`@privy-io/react-auth/extended-chains`): there is no `createOnLogin` for it, the embedded wallet is
  created with `useCreateWallet({ chainType: "stellar" })` and signs with `useSignRawHash` (a 32-byte
  hash in, an ed25519 signature out). Privy has no external Stellar wallets. Without
  `NEXT_PUBLIC_PRIVY_APP_ID` the app uses a mock session. UI reads auth only through `useSession()`
  (`src/session/`).
- **Wallet login link** (user decision, 2026-10-25): the landing keeps the quiet "Already have a
  crypto wallet? Use it instead" link in the code, but only email login is offered for now
  (`LOGIN_METHODS` in `src/session/context.ts`; the link shows when it lists `"wallet"`).
- **Network fees and rent are the app's, never the user's**, through the **backend relay**. The
  wallet never signs a transaction envelope: `POST /v1/tx/prepare {fn, groupId, index?}` builds and
  simulates the call with the backend's sponsor as the transaction source and answers the
  authorization payloads (one 32-byte hash per Soroban authorization entry); the session wallet signs
  each one (`SessionSigner.signHash`); `POST /v1/tx/relay` attaches the signatures, re-validates,
  simulates again, adds the sponsor's signature, sends and answers once confirmed. The relay accepts
  only `join_group`, `pay_quota` and `claim_prize`. A wallet must exist on the ledger before it can
  authorize anything: `POST /v1/kyc` creates it (sponsor-paid); `prepare` answers `409
  account_not_active` otherwise. No XLM, gas or fee handling anywhere in the UI. Privy's wallet modal
  is off (`embeddedWallets.showWalletUIs: false`): our screens are the single confirmation step and
  show "Network fee · covered by kotizi · FREE" (`checkout/network-fee-row.tsx`) on join and pay.
  **Every payment asks for confirmation in our own modal** (user rule, against misclicks): the
  checkout, `checkout/checkout-dialog.tsx`, shows the amount, the details and the free network fee;
  Cancel has the initial focus (Enter or Esc never pays). Used by `PayQuotaButton` (home and
  `/payments`) and the join screen ("Join group" → "Confirm and join"). Any new paying action must
  open it too.

## Chain access (ADR-001: hybrid adapter)

- **Mock-first**: all chain access goes through the `KotiziClient` interface
  (`src/chain/client.ts`). `MockKotiziClient` (`src/chain/mock/`) mirrors the contract's checks and
  error codes and is the default (`NEXT_PUBLIC_CHAIN_CLIENT=mock`); it stays as a labelled fallback.
  The Stellar client (`NEXT_PUBLIC_CHAIN_CLIENT=stellar`, in progress, see "Stellar integration")
  implements the same interface. UI components never import chain libraries.
- Draws: `KotiziClient.drawNow({ group })` runs the next step (`request_draw` or `settle_draw`) or
  returns why there is none (`notDue`, `noEligibleShares`, `waitingForRandomness`, `completed`, the
  keeper's reasons). `drawUntilSettled` (`src/chain/draw.ts`) makes the "Draw now" button a single
  click. The mock picks steps the way the keeper does, on drand's clock (`src/chain/drand.ts`).
- **Draw threshold** (user decision, 2026-10-12; frontend only, the contract doesn't know it): the
  app draws only once `DRAW_THRESHOLD_PCT` (80%, one constant in `src/chain/derive.ts`) of the
  **taken** shares paid the period's installment (`paidRequired` = ceil(joined × 80%), contemplated
  shares that keep paying count). `drawPhase` adds `"belowThreshold"` on top of `chainDrawPhase` (the
  contract's rules, used by the mock); "Draw now" only shows when due, `drawUntilSettled` refuses to
  start a draw below it (`belowThreshold` reason) but always settles a pending one, and draws/home show
  "N more installments to open the draw" (`components/group/draw-threshold.tsx`). Limitation: the
  backend keeper still draws on the due date and `request_draw` is permissionless.
- **Group creation (admin only)** (user decision, 2026-10-12): `/admin/groups/new`, linked from the
  groups page ("Create group") and the account menu only when `useIsAdmin()` (`src/features/admin`,
  `KotiziClient.isAdmin`; the mock lets every account create). Form: property (a `GROUP_CONTENT` slug;
  `uri` = `<origin>/metadata/<slug>.json?value=<usd>`), name (≤ 32 bytes), property value (prefilled
  from the content, editable), shares (2–64), period chips (1 min, 5 min, daily, monthly), admin fee
  (≤ 10%). **The admin sets the property value and the credit value equals it**: the installment isn't
  typed, it's value ÷ shares, and a share count that doesn't split the value into whole cents is
  refused with the nearest counts that do. The contract has no property value: it travels in the uri
  (`?value=`, read by `app/metadata/[file]/route.ts`, which falls back to the content's
  `propertyValueUsd`), so only groups created from this screen are aligned; confirmation modal with
  Cancel focused. `KotiziClient.createGroup` mirrors the contract's checks (`NameTooLong`,
  `UriTooLong`, `InvalidQuota`, `InvalidMaxMembers`, `InvalidPeriod`, `FeeTooHigh`, `Unauthorized`).
  **Not sponsored**: the relay doesn't accept `create_group`, so the admin's own wallet signs and pays
  it. On Stellar that wallet is **Freighter** on the admin screen (user decision, 2026-10-25: Privy has
  no external Stellar wallets and the contract's admin is the deployer key); see "Stellar
  integration". The metadata uri uses the browser's origin, so create groups from the deployed app,
  not localhost, if others must read their content. Groups can't be closed on chain.
- Keep `src/chain/types.ts`, `derive.ts` and `errors.ts` in sync with `../contract/kotizi/src`
  (`types.rs`, `errors.rs`, `lib.rs`).

```
app/ + components/ + features/  (UI: no chain SDK imports; LoadError for failed reads)
   │ useSession()                       │ useChainQuery / useChainAction / useKotiziClient
   ▼                                    ▼
src/session/                         src/chain/
├── context.ts   Session + SessionSigner   ├── provider.tsx  ChainProvider: createKotiziClient(…)
├── privy-session.tsx (Privy wallet →      ├── hooks.ts      in-house query layer, keyed + deduped (no TanStack Query)
│   signHash, getAccessToken)              ├── client.ts     KotiziClient interface (+ optional `testing`)
├── mock-session.tsx (signer: null)        ├── types.ts derive.ts share.ts   chain-agnostic, mirror the contract
├── provider.tsx SessionProvider: Privy|mock ├── network.ts  the one network: name and explorer links
└── identity-check.ts (login → /verify)    ├── draw.ts       drawUntilSettled: one-click "Draw now"
                                           ├── errors.ts     KotiziError: contract codes + tx failures (UserRejected,
                                           │                 TransactionExpired, NetworkError, SessionExpired,
                                           │                 SponsorUnavailable, ServiceUnavailable, TransactionFailed)
                                           ├── metadata.ts   Group.uri JSON (Metaplex-style) build/parse/fetch (+ app-wide cache)
                                           ├── api.ts        backend HTTP client, answers checked with Zod
                                           ├── views.ts      backend group/draw fields (toGroupState, toDrawStep)
                                           ├── mock/         MockKotiziClient (localStorage, bots, failure simulation) — default
                                           └── stellar/      StellarKotiziClient (in progress)
src/content/groups.ts   property content per group slug (mock seed + metadata route)
app/metadata/[file]     GET /metadata/<slug>.json: NFT metadata behind Group.uri (CORS open)
```

Providers nest as `SessionProvider → ChainProvider → UI` (`app/providers.tsx`). `SessionProvider`
(`src/session/provider.tsx`) is the composition root for the session: the only place that picks
`PrivySession` (with `NEXT_PUBLIC_PRIVY_APP_ID`) or `MockSession`; `app/` never imports either. The
mock is a single shared instance. Queries poll only while the tab is visible, on wall-clock multiples
of their interval (readers of a key ask together, one request); an answer equal to the last one keeps
the old object (`sameValue`, no re-render); a key nobody reads for 5 min leaves the cache. Parts one
layout hides by CSS (sidebar, mobile top bar, home's desktop-only cards) are wrapped in
`<Breakpoint show="desktop" | "mobile">` so they don't mount, and poll, on the other.
`KotiziClient.listSharesByOwner` returns each share with its group. Identity-record reads always go
through `useKyc` / `useWalletState` (`src/chain/use-account.ts`) so every reader shares one key and
fetcher; `useKyc` stops polling once the record exists (actions still refetch it).

- **Backend client** (`src/chain/api.ts`): **every answer is validated with Zod**
  (`request(path, schema, options?)`, no bare `request<T>`): `safeParse` after the `!response.ok`
  check; a mismatch throws `BackendError(502, "invalid_response")`, which the `status >= 500` mapping
  turns into `ServiceUnavailable`. Schemas live next to the views (`chain/views.ts`: `numericString`,
  `groupStateViewSchema`); the view types are their `z.infer`; bigints stay strings in the schemas.
  A rate-limited GET is repeated after 2, 4 and 8 s before failing (writes never are), and
  `no_wallet`/`not_user_wallet` are retried for up to 35 s (the backend caches a user's linked wallets
  for 30 s, so a just-created embedded wallet can be missing there).
- **Polling budget**: the backend allows 120 requests a minute per IP. Polls default to 10 s
  (`hooks.ts`), the open groups list 20 s, a group page 5 s, the share list 30 s (own actions refetch
  at once); group metadata is cached once per uri for the whole app (`cachedGroupMetadata`).

## Stellar integration (in progress, 2026-10-25)

Plan (one commit per part, `bun run quality` and `bun run build` after each; branch
`feature/stellar-frontend-integration`):

1. Dependencies and docs (this file and `README.md`). **Done.** Next.js moved to 16.4.3 (security
   advisories of 16.4.0) in its own commit.
2. Mock and types mirror the contract. **Done:**
   - **Ids** (`src/chain/ids.ts`, tested): `Group.id` is the contract's group number as a string
     (`"0"`, `"1"`…; `Group.groupId` the number), `Membership.id` is `"<group>-<index>"`;
     `parseGroupId`/`parseMembershipId` refuse anything else, so a bad id never reaches the backend.
     `Group.address` and `Membership.address` are the Kotizi contract (one for every group);
     `Membership.asset` is the NFT token id (`nftTokenId`: `(group << 8) | index`).
   - **Draws** (`src/chain/drand.ts`, tested): quicknet's clock as the contract uses it
     (`roundTime`, `roundAfter`, `DRAW_ROUND_DELAY` 10, `DRAW_EXPIRY_SECS` 3600, `beaconUrl`).
     `Group.drawSource` is `"drand"` or `"mock"`, `Group.drawRound` the pending draw's round (0 when
     none). `/draws` names the source in `OnchainDetails` ("drand random beacon, verified by the
     contract" · round N, or "Simulated (demo)").
   - **Mock** (`kotizi:mock:v6`): groups numbered from 0 in one simulated contract, shares by group and
     index; draws follow drand's clock (settle once the round is out, request again an hour after an
     unsettled round) with a **1-round delay instead of 10**, so a mock draw settles within 3 s; the
     winner is a local random pick (no beacon). `txReturning` answers a value from a mock
     transaction (the new share or group id).
   - **Units**: amounts in the app are USD with 6 decimals whatever the group's token (`types.ts`);
     the Stellar client converts each token's decimals at its boundary (part 4).
   - **Errors** (`errors.ts`): the Solana-only `SlotHashUnavailable` and `RandomnessNotFulfilled` are
     gone; `InvalidBeacon`, `InsufficientVault` and `TokenNotSupported` are new. The Stellar client
     maps the contract's names onto the app's codes (`NotKyc` → `KycRequired`…).
   - **Explorer**: `stellarExpertUrl` (`network.ts`, tested) links transactions, contracts (`C…`) and
     accounts (`G…`) on stellar.expert's testnet.
   - Known for part 5: a real draw takes about 36 s (the round is 30 s ahead, plus the keeper's slack),
     longer than `drawUntilSettled`'s default wait (10 × 1.5 s).
3. Privy Stellar session. **Done** (`src/session/privy-session.tsx`, helpers in
   `src/session/stellar-wallet.ts`, tested):
   - Privy `loginMethods` come from `LOGIN_METHODS` (`session/context.ts`: `["email"]`), also exposed
     as `Session.loginMethods`; the landing shows the wallet link only when it lists `"wallet"`.
   - `useEnsureStellarWallet`: in `useLogin`'s `onComplete` (after Privy's modal, on a login or a
     restored session), an account with no linked Stellar wallet (`needsStellarWallet`) gets its
     embedded one (`useCreateWallet({ chainType: "stellar" })` from `extended-chains`); once per
     account and tab, 3 tries 2 s apart, else the next visit retries. Every new account goes through
     this, since Stellar has no `createOnLogin`.
   - `Session.address` = `stellarAddressOf(user)`: the linked Stellar wallet, embedded first
     (`walletClientType` `privy` or `privy-v2`).
   - `SessionSigner.signHash(hash)` → `useSignRawHash({ address, chainType: "stellar", hash: 0x… })`;
     the 64-byte ed25519 signature is checked (`signatureBytes`). The hook is read through a ref so
     the signer stays stable per address.
   - **Checked with a real Privy app (2026-10-25)**: a new email account got its embedded Stellar wallet
     (a `G…` address in Privy's dashboard) this way. Signing (`useSignRawHash`) is first exercised by
     the relay in part 5; the backend's `stellarWalletsOf` reads the same `chain_type: "stellar"`.
4. `StellarKotiziClient` reads. **Done** (`src/chain/stellar/`, each module tested; the client tests
   use a fake `request` that runs each schema, so fixtures must match the backend):
   - `createKotiziClient({ signer, getAccessToken })` (`chain/index.ts`) returns it with
     `NEXT_PUBLIC_CHAIN_CLIENT=stellar` (`createBackendApi` on `NEXT_PUBLIC_API_URL`); `ChainProvider`
     rebuilds it when the session's signer or token source changes. The mock stays the default.
   - `views.ts`: one Zod schema per route (`configViewSchema`, `groupViewSchema` =
     `groupStateViewSchema.extend`, `membersViewSchema`, `meViewSchema`, `kycViewSchema`) and
     `toGroup`/`toMembership`. Checked against the running backend (2026-10-25): `/v1/config`,
     `/v1/groups`, `/v1/groups/:id` and `/members` parse.
   - `units.ts`: `toAppUnits` (token → app, a 7-decimal token drops its last digit, for display only)
     and `toTokenUnits` (app → token, exact or `InvalidQuota`, for what goes on chain).
   - Reads: groups and members from the backend (ids per `ids.ts`, invalid ids never sent, 404 → null,
     concurrent reads of a group share one request); the account's shares, identity flag and balance
     from `/v1/me` (one request per poll, `getKyc` → `{ approvedAt: 0 }`, `getUsdcBalance` = the
     faucet token's balance); `isTestNetwork` = the passphrase isn't the public network's; `isAdmin`
     = `/v1/config` → `admin` (read once).
   - **The open list keeps only groups in the faucet's token** (`faucetToken`, user decision
     2026-10-25): Circle's USDC needs a trustline the app doesn't create and the 7-decimal test token
     has no faucet. Any group still opens by id; without a faucet every group is listed.
   - `verifyIdentity` → `POST /v1/kyc { wallet }` (also creates the ledger account). It is here and
     not in part 5 because every new account goes through `/verify`.
   - `errors.ts`: `CONTRACT_ERRORS` (the contract's names in `contract_error`/`draw_failed` → app
     codes) plus `UNMAPPED_CONTRACT_ERRORS`; a test reads `contract/kotizi/src/errors.rs` and fails on
     any name in neither. Also `Error(Contract, #100)` (the demo token's `InsufficientBalance`) →
     `InsufficientFunds`, `account_not_active` → `KycRequired`, `authorization_expired` →
     `TransactionExpired`, `not_user_wallet` → `NotAssetOwner`.
5. `StellarKotiziClient` actions. **Done** (`stellar/client.ts`, tested):
   - **Relay** (`relay()`): `POST /v1/tx/prepare { fn, groupId, index?, wallet }` →
     `{ transaction, validUntilLedger, payloads }`; each 32-byte payload is signed by the session's
     wallet (`signHash`) and sent as 64-byte hex to `POST /v1/tx/relay`, which answers `{ txHash }` once
     confirmed. A payload for any address but the session's wallet is refused before signing
     (`NotAssetOwner`); no signer → `SessionExpired`; one relayed call at a time (`createSerialQueue`).
     The client trusts the backend to build the call it asked for (it doesn't decode the XDR).
   - `joinGroup`: `join_group`, then `pay_quota` for the new share when `payFirstQuota` (two relayed
     calls; the new share is the one the wallet didn't hold before). Not atomic like the mock: if the
     payment fails, the share exists unpaid and the join screen shows the payment's error.
     `payQuota`/`claimPrize` relay `pay_quota`/`claim_prize`.
   - `drawNow` → `POST /v1/groups/:id/draw` (`toDrawStep`). `drawUntilSettled` now waits up to 45 s
     by default (the drand round is 30 s ahead and the backend settles a few seconds after it).
   - `testing.fundUsdc` → `POST /v1/faucet` (fixed `FAUCET_AMOUNT_USDC`, once per wallet per day);
     `testing.depositShortfall` funds only when the wallet's demo-token balance can't cover the amount.
   - **Checked on testnet (2026-10-25)** with this client in a script against a local backend in
     `AUTH_MODE=dev` (a throwaway key signing instead of Privy): identity + account activation, faucet,
     join and pay through the relay (the contract accepted the ed25519 signatures), a refusal mapped
     to `GroupNotOpen`, and "draw now" reaching the keeper.
   - **The backend's keeper draws on the due date with whatever paid** (it doesn't know the app's 80%
     threshold): on a short-period group the draw can start after the first payment and freeze the
     others' (`GroupNotOpen`). For demos where only "Draw now" should draw, run the backend with
     `KEEPER_ENABLED=false`.
6. Admin group creation with Freighter: the admin connects Freighter on the admin screen, the app
   builds `create_group` with `@stellar/stellar-sdk` (simulated on the RPC from `/v1/config`),
   Freighter signs, the app sends it and waits for the result; a token picker from `/v1/config`.
7. End to end in the browser on testnet (Privy app with Stellar enabled, backend running).

Facts to build on:

- `/v1/config` answers the contract id, `rpcUrl`, `networkPassphrase`, the admin, the enabled
  `tokens` (`{ token, decimals }`), the sponsor and the faucet token, so the front needs no contract or
  RPC variables. `isTestNetwork` = the passphrase isn't the public network's.
- A group view carries `mint` (its token), `decimals`, `drawSource: "drand"` and `drawRound`;
  `/v1/me` answers each wallet's `active`, `kyc` and `balances` (token → base units) and its `cotas`;
  `/v1/groups/:id/members` answers each share's owner and `totalPaid`, so Stellar shares number their
  installments.

## Consórcio alignment

Goal: make the journey match how a real consórcio works. Where each part fits: what changes how much
money moves, when or to whom is on-chain; what only changes how it is presented is frontend.

The contract already works like a consórcio in these ways: fixed number of shares, the same quota for
everyone, one draw per period with verifiable randomness, each share wins once, unpaid shares aren't
eligible, winners can keep paying, and the share is a transferable NFT. It differs here (contract
team, roadmap): a fixed credit value paid in full (today the prize is what was paid in that round),
the admin fee and a reserve fund inside the installment, a forming → active status (today draws run
on partial groups), mandatory payments after winning plus default handling, bids, and paying the
credit to a seller or escrow instead of the member. Backend, possible now: index the contract's
events into a share activity route (payment history is shown as out of scope today).

**Frontend (done in the reference app and kept here):**
- Consórcio vocabulary in English (user decision, 2026-10-11): credit value, installment, term,
  contemplated (the event stays "draw", the button "Draw now"). Code names (`quotaAmount`, `prize`,
  `round`) stay. "Credit value", never "credit letter" (`creditValue`/`creditValueFee` in `derive.ts`).
- Group card, `/groups`, group detail and join screens: credit value = `creditValue` (quota × shares,
  gross; matches `propertyValueUsd`), admin fee = `creditValueFee`, the net shown as "Released when
  contemplated" (`fullRoundPrize`). `FormingNotice` (`components/group/forming-notice.tsx`, with
  `isForming`/`formingRoundPrize`) says a draw releases less while the group fills or a share misses
  an installment. The group detail shows the property value from the metadata; the join checkbox says
  installments continue after contemplation.
- The credit screen breaks the amount down (credit value, collected in draw N, admin fee, you
  receive) with an "Installments continue" card (`quotasLeft`). Home has "Your share's path"
  (`components/share/share-journey.tsx`).
- Installments are numbered per share (`currentInstallment`/`installmentsTotal` in `chain/share.ts`:
  "Installment 1 of 5" for a late joiner), never by the draw number. A share without `totalPaid`
  (`null`) isn't numbered ("Installment for draw N").
- **No roadmap or future-feature copy anywhere in the UI** (no "Coming soon", no "on the roadmap";
  user decision, 2026-10-13): the roadmap lives in the docs and the pitch. The mock may simulate rules
  ahead of the contract only if clearly labelled.
- **No withdrawal: the credit goes to the property** (user decision, 2026-10-11): the UI never calls
  `claim_prize` (on-chain it would pay the member). A contemplated share's credit stays in the
  contract and the UI says it "will be sent to the company responsible for the property": the credit
  screen is "Credit reserved", home and draws link to it with "See my credit", and the group detail
  says the same. `claimPrize` stays in `KotiziClient` and the mock, unused by the UI.

## UI rules

- **Abstract crypto in the UI**: amounts are labelled "USD" (internal names like `formatUsdc`
  stay); no wallet addresses on screen; say "account"/"balance"/"confirm" instead of
  "wallet"/"sign"; "identity verification" instead of "KYC". Transaction hashes, the group contract
  and the randomness proof live only inside the collapsed `OnchainDetails` panel. The network
  ("Stellar testnet" or "Simulated", `network.name` in `src/chain/network.ts`) is the first row of
  `OnchainDetails`, the only place the UI names it. The admin screen is the operator's and may say
  "wallet" (Freighter).
- **Identity verification (KYC)** is not account creation (the account is the Privy login): it gates
  joining a group. **Who verifies** (`requiresIdentityCheck`, `src/session/identity-check.ts`): a
  **new Privy account** always goes through the form once (even if its wallet is already approved),
  and **any account whose wallet has no approval** too. While the record is unknown (loading, failed
  read) only a new account waits; `join_group` still enforces it on chain. "New" is Privy's
  `isNewUser` from `useLogin`'s `onComplete` (only on a real login), kept in `sessionStorage` until the
  form is done; Privy also fires `onComplete` whenever one of its modals closes after a login, so
  `markLogin` records each account once per tab and ignores repeats; sign out clears it. Once the form
  succeeds, `completeIdentityCheck` also marks the account verified in this tab
  (`Session.identityVerified`), so a lagging read can't send it back to /verify.
  `useIdentityCheckRequired()` (`components/shell/identity-gate.tsx`) combines it with a settled
  `getKyc` read; `IdentityGate` in `(app)/layout.tsx` sends to `/verify?next=…`. While the answer is
  unknown the gate shows `ScreenLoading`, so the app never flashes before /verify; a failed read
  doesn't hold it. After approving, `/verify` waits for a fresh read showing the record, then shows
  "Your identity is verified." with a "Go to home" (or "Continue") button; it never redirects on its
  own. The form (full name, CPF masked `000.000.000-00`, date of birth; `src/lib/identity.ts`: 18+,
  any 11-digit CPF passes in the demo) is a **demo** (no "Demo" badge on screen, user decision
  2026-10-25): validated in the browser, never sent or
  stored; `KotiziClient.verifyIdentity(wallet)` asks the backend's KYC mock (`POST /v1/kyc`,
  `KYC_MODE=auto`), which only receives the wallet. `kyc_unavailable` → `IdentityVerificationUnavailable`.
- **Test helpers never on mainnet** (user rule): the checkout's deposit, failure simulation and the
  other `testing` helpers are read only through `useTestHelpers()` (`src/chain/use-test-helpers.ts`),
  never `client.testing` directly. It returns them only once `KotiziClient.isTestNetwork()` answers
  true; hidden while unknown or on error.
- **Checkout, no balance** (user decision, 2026-10-12): the app keeps no balance and shows none.
  Money comes in with each payment: `CheckoutDialog` (review → "Pay with" Bank transfer / Pix / Crypto
  → that method's instructions → "Confirm payment"/"Confirm and join"; the checkout closes and the
  status dialog shows "Confirming your payment…", then the action's progress and outcome, see
  "Status dialog"). The methods and their mock data live in `checkout/deposit-methods.tsx`,
  with no demo labels. On test networks the deposit is `testing.depositShortfall({ owner, amount })`:
  it adds only what the account's wallet lacks (null when it covers it). The mock credits exactly the
  shortfall; the backend faucet mints its own fixed amount once per wallet per day, so a second
  deposit the same day shows "Deposits are limited to one a day" (`FaucetLimit`). Nothing to pay now
  (a join during a draw) or no test helpers → a plain confirmation. The receipt on `/payments` says
  "Paid with <method>". The mock-only helpers stay under "Test helpers" in the account menu.
- **Route guards** (user rule): every screen under `(app)/` is for signed-in accounts only.
  `AuthGate` (`components/shell/auth-gate.tsx`) sends a signed-out visitor to the landing page and
  renders nothing of the app; while the session loads the screens render with their own placeholders
  (keep it that way: Next's prerender and instant-navigation check see a loading session, and a gate
  that hides the page then makes Next drop the segment). `AdminGate` (`features/admin`, used by
  `(app)/admin/layout.tsx`) sends any account that isn't the admin to `/home`; it holds a placeholder
  until then, so that layout sets `export const instant = false` (and
  `/admin/groups/new/page.tsx` too: the layout's doesn't cover the page). `/verify` sends a signed-out
  visitor to `/`. Client-side guards; the contract and the backend enforce the real rules.
- **Sign out**: always through `useSignOut()` (`components/shell/use-sign-out.ts`), never
  `session.logout` directly. It sets a "signing out" flag (`useSigningOut`), goes to the landing page,
  awaits `Session.logout()` (also clears the identity check), then clears the selected share
  (`clearSelectedShare`) and every cached chain read (`resetChainCache` in `chain/hooks.ts`). While the
  flag is on, the app's screens, the sidebar account card and the mobile bar show placeholders, and the
  landing page doesn't send the still signed-in session back to /home; the landing clears it
  (`endSignOut`) once the session is signed out. Entry points: the sidebar's account card, the account
  menu and `/verify`.
- **Error boundaries** (Next 16 file conventions; props `error` + `retry`, preferred over `reset`): a
  failed chain read is `LoadError` inside the screen; a screen that throws while rendering falls to
  `(app)/error.tsx` (inside the shell, so the sidebar still navigates away), `app/error.tsx` (landing,
  `/verify`) or `app/global-error.tsx` (replaces the root layout: its own `<html>`/`<body>`,
  `globals.css` and `fontVariables` from `app/fonts.ts`, no providers). "Try again" calls
  `invalidateChain()` before `retry()` (chain reads are a client cache that `retry` doesn't refetch).
  `role="alert"`; never show `error.message`. `app/error.tsx` has no "go to the start page" link: on
  the landing it loops back to the broken page.
- **Brand** (team brandbook, not in this repo): dark mode is the standard (60% graphite `#171717`,
  30% Kotizi blue `#0000FF`, 10% lavender `#B6B6F0` + white); Archivo for text, IBM Plex Mono for
  figures, amounts and statuses; one highlighted number per screen; brand name always lowercase
  (`kotizi`). Tokens live in `src/app/globals.css`.
- **Screens** (from the team's design handoff): routes `/`, `/home`, `/groups`, `/groups/[id]`,
  `/groups/[id]/join`, `/groups/[id]/credit`, `/payments`, `/draws`, `/verify`, `/admin/groups/new`.
  Not implemented, pending decisions: pt-BR/i18n, BRL. Shown as out of scope: Pix, autopay, payment
  history, "use for purchase" / "withdraw via Pix".
- **Status dialog, no toasts** (user decision, 2026-10-25): every action's progress, outcome and
  failure show in one dialog, the one the checkout uses after a payment: `ActionStatusDialog`
  (`components/shell/action-status-dialog.tsx`, mounted once in `app/providers.tsx`) reads
  `chain/action-status.ts` (`showActionStatus`, `closeActionStatus`, `useActionStatus`).
  `useChainAction().run(key, action, { pending, success, failure? }, { feedback? })` drives it: the
  pending title with a spinner (it can't be closed while running), then the outcome (`success`: a title
  or `{ title, description?, tone: "success" | "info" }`, with "Done"), or the failure (`failure` as
  the title, the error's message under it, "Close"; a cancelled confirmation is neutral, "Nothing was
  sent."). `feedback: "errors"` opens it only on a failure (`/verify` shows its own progress). The
  checkout drives it for its deposit (`Payment not completed` with "Try again", or "Deposit limit
  reached" as a warning) and hands over to the action in the same dialog. "Draw now": "Share
  contemplated" (success), "Draw started" or "No draw yet" with the reason (info). `sonner` is gone.
  E2E: `closeStatus(page, title)` (`e2e/helpers.ts`) waits for the outcome and clicks "Done".
- **Screen states**:
  - `html` has `color-scheme: dark`, and autofilled inputs keep the field's surface and text
    (`globals.css`).
  - Privy's modal uses the graphite background (`appearance.theme: "#171717"`).
  - "Open groups" (`OpenGroups`) lists only groups with an open spot (`isForming`); the term filter
    only shows with more than one term. `HIDDEN_GROUP_IDS` in `open-groups.tsx` hides test groups by
    id (empty today); their pages and existing shares still work.
  - While the session is "loading" or signing out, the sidebar's account card is a skeleton and the
    mobile top bar shows no "Sign in".
  - After a join, the new share is selected (`selectShare`), so "Go to home" opens on it. Group
    detail: a member gets "Go to my share"; "Take another share" is secondary; "Group is full" only
    for non-members.
  - Share grid: taken-but-unpaid shares are filled (`bg-control`), open spots dashed, numbers as
    `formatShare` ("005").
  - Home draw card: a contemplated share shows its own number, a "Contemplated" badge and the amount;
    otherwise "N eligible share(s)" (`plural` in `lib/format.ts`).
  - Loading: `ScreenLoading` (`kz/screen.tsx`) for a screen whose content isn't known yet;
    `GroupLoading` mirrors the group screen's two columns. A skeleton has the height of what replaces
    it and holds the place of anything that only shows after the data; home's "Open groups" renders
    only once the shares above have loaded (`useSharesSettled`). The shell's content is the page's
    `<main>`.
  - `useNow` (1 s clock) goes in the smallest component that shows time (home: `NextSteps`,
    `DrawCard`), never at the top of a screen.

## Design system

Implemented from the team's Figma "Kotizi — Design System · Átomos" (dark mode only; the Figma copy
is in Spanish, the UI stays in English; some values were read from screenshots and are estimates):

- *Selección*: `focus-ring` utility (2 px lavender outer ring; use it on every interactive element),
  `kz/chip.tsx` (used by `SegmentedPills` and `ShareSwitcher`), `ui/checkbox.tsx`. The selected share
  (`useSelectedShare`) is shared by home, payments and draws and kept in `sessionStorage`. Radio and
  switch are not built (no screen needs them).
- *Botones y links*: `ui/button.tsx` variants `primary` (Kotizi blue, the main CTA), `secondary`
  (outline), `ghost`, `inverse` (white, only on blue surfaces or over the light); sizes
  `sm`/`md`/`lg`/`xl` = 32/40/48/56 px; `IconButton` (`icon-md`/`icon-lg`, `aria-label` required);
  `kz/text-link.tsx` (`TextLink` + `textLinkVariants`).
- *Campo de texto*: `ui/input.tsx` (40/48 px, error via `aria-invalid` with an alert icon, optional
  leading `icon`).
- *Indicadores*: `ui/badge.tsx` (`tone` neutral/blue/info/success/warning/danger × `variant`
  subtle/solid, mono uppercase), `kz/user-avatar.tsx` (initials from the email, icon when there is
  none), `ui/progress.tsx` (`sm`/`md`), `kz/step-marker.tsx`.
- *Íconos*: lucide (the 25 design-system icons exist there); a global `svg.lucide` rule sets a 1.5 px
  stroke, square caps and miter joins. Keep that selector plain: the production build silently drops
  `:where(svg.lucide)`.
- *Marca*: `<Luz variant="page" | "card">` (`kz/luz.tsx`, blurred light + grain from the `--grain`
  token; keep its bright core away from text). Logo: white on blue/graphite, blue or graphite on
  light backgrounds.
- *Grilla*: `page-grid` utility (12 columns, 24 px gutter, margins 64/80/96 at 1024/1440/1920; 4
  columns below 1024), used only on the landing page. 8 pt base for heights.
- *Efectos y gradientes*: `shadow-elevation-1/2/3` (1 cards at rest, 2 menus/popovers, 3 modals),
  `vidro` (24 px blur, 16% white stroke), `bg-luz-diagonal` and `bg-luz-profunda` for crisp UI
  gradients (brand pieces always use the blurred `<Luz />`).
- *Color*: primitive scales (`--blue-*`, `--gray-*`, `--green/red/amber-*`, alphas) are raw values
  only; components use the dark semantic tokens through per-property namespaces that keep the Figma
  names: `bg-canvas/surface/surface-raised/brand/brand-hover/brand-pressed/brand-subtle/hover/pressed/
  disabled/control/*-subtle`, `text-primary/secondary/tertiary/disabled/inverse/on-brand/on-status/
  brand/brand-hover`, `border-subtle/default/strong/brand/focus/error`,
  `ring-default/focus/subtle/inverse`, status `success/error/warning/info`. Use `text-primary` on
  graphite and `text-on-brand` on blue; the logo stays `text-white`. Brand palette names (`lavender`,
  `kotizi-blue`, `deep-blue`, `mist`, `graphite`) remain. Deviations: `text-tertiary` = gray-400 and
  `text-disabled` = gray-500 (the Figma's darker values fail contrast). shadcn tokens (`--muted`,
  `--accent`, `--destructive`…) point at the semantics; the DS `bg/accent` isn't exposed (name
  clash), use `bg-lavender`. Light mode and `icon/*` tokens are not built.
- *Tipografía*: `type-*` utilities with the Figma values (`type-display`, `type-h1`…`h5`,
  `type-body-lg/md/sm`, `type-label-lg/md/sm`, `type-mono-caption/overline/micro`,
  `type-data-lg/md/sm`, `type-firma`, `type-firma-light`). They are utilities, not `--text-*` sizes,
  because `cn` drops a theme size followed by a text color. Screen titles use `type-h3`, section
  titles `type-h5`; **highlighted amounts are Plex Mono** (`type-data-*`); `label-mono` is Mono/Micro
  in `text-tertiary`. Button, Chip and TextLink keep the sizes from their own DS pages.
- *Espaciado, radios y tamaños*: spacing matches Tailwind's 4 px scale. The radius scale replaces
  shadcn's: `rounded-xs/sm/md/lg/xl/2xl` = 4/8/12/20/24/32, `full` for pills; fields `md`, cards `lg`
  (`xl` for the large ones). Icons 16/20/24 (`size-4/5/6`).
- Shared surfaces: `ui/card.tsx` (`Card` + `cardVariants`: `surface`/`plano`, radius `lg`/`xl`,
  padding, `elevation-1` by default, `interactive`, `render` prop). `cn` can't merge custom tokens
  passed through `className`, so expose them as variants. Status labels use `Badge`, never plain text.

## Hard rules

- Never commit, print or hard-code private keys or secret seeds (`S…`). Server keys live in
  `../keypairs/` (gitignored) and are read only by the backend.
- **Stellar testnet only. Never target the public network** (`Public Global Stellar Network ;
  September 2015`).
- Don't change the contract from frontend work without the team agreeing; its interface is the
  frontend contract.
- Respect licenses of third-party code and note them in the README.
- Ask before adding a new major dependency or making an architectural decision.

## How to work

- Prefer the smallest thing that works end to end over a broad, unfinished feature set. No fake
  stubs passed off as working features; if something is mocked for the demo, label it clearly.
- Verify changes by running them (build, typecheck, the app) before reporting them as done.
