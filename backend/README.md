# Kotizi backend (Stellar testnet)

Fastify + Privy auth + Drizzle (Postgres, or embedded PGlite when `DATABASE_URL` is unset) in front of the
Kotizi Soroban contract (`../contract`). Testnet only: any other `NETWORK_PASSPHRASE` is refused.

```bash
cp .env.example .env          # AUTH_MODE=dev for local work; set CONTRACT_ID and the key files
npm install --legacy-peer-deps
npm run typecheck && npm test # offline: the tests use an in-memory Chain
npm run dev
```

## Roles and keys

Key files hold a secret seed (`S...`), live outside git and are never logged. One file may serve several roles.

| Key | Role |
|---|---|
| `SPONSOR_KEYFILE` | source and fee payer of relayed transactions; creates accounts for new wallets |
| `KEEPER_KEYFILE` | signs `request_draw` / `settle_draw`, pays its own fee (defaults to the sponsor) |
| `KYC_KEYFILE` | must be the contract's `kyc_authority` (`approve_kyc`) |
| `MINT_KEYFILE` | must be the admin of `FAUCET_TOKEN` (faucet mint) |
| `FAUCET_TOKEN` | the demo test token the faucet mints; required with `FAUCET_ENABLED` |

The admin signs `create_group` with their own wallet (not here), so no admin key lives on the server.

## Endpoints

| | |
|---|---|
| `GET /healthz`, `GET /v1/config` | liveness; contract id, admin, enabled tokens (with decimals), sponsor, KYC/faucet modes |
| `GET /v1/groups`, `/v1/groups/:id`, `/v1/groups/:id/members` | group state (bigints as strings, bitmaps as index lists), cota owners |
| `GET /v1/me` | the user's wallets (account active, KYC, balance per enabled token) and cotas |
| `POST /v1/kyc` | creates the wallet's account if missing, then `approve_kyc` (`KYC_MODE=auto`) |
| `POST /v1/faucet` | mints test USDC, one claim per wallet per day |
| `POST /v1/tx/prepare`, `POST /v1/tx/relay` | gasless `join_group` / `pay_quota` / `claim_prize` (below) |
| `POST /v1/groups/:id/draw` | "draw now": the keeper runs the next `request_draw` / `settle_draw` step |

Errors are `{code, message}`; a contract failure is `422 {code: "contract_error", message: "<ContractErrorName>"}`.

## Gasless relay

The wallet signs only a Soroban authorization payload, never a transaction envelope.

1. `POST /v1/tx/prepare {fn, groupId, index?}`: the API builds the call with the **sponsor as transaction
   source**, simulates it, validates it, and answers `{transaction, validUntilLedger, payloads: [{address, payload}]}`.
2. The wallet signs each 32-byte `payload` (ed25519, Privy raw sign).
3. `POST /v1/tx/relay {transaction, validUntilLedger, signatures}`: the API re-validates the XDR (the client may
   have changed it), attaches the signatures to the authorization entries, simulates again in enforcing mode with
   a fresh sequence number, validates the result, adds the sponsor signature and sends.

What the validation enforces (`src/relay/validate.ts`, each rule has a test that fails without it):
sponsor is the source and nowhere else (no operation source, no source-account credentials, never an authorizer);
one invoke operation on the Kotizi contract, only `join_group`, `pay_quota`, `claim_prize`; every authorization
entry is for a wallet linked to the authenticated user and for exactly this call and arguments; the only
sub-call allowed is the group token's `transfer` from that wallet to the contract (and only for `pay_quota`);
no memo; fee below `RELAY_MAX_FEE_STROOPS`. Budget: per-user daily count, global daily stroops, sponsor reserve.

A wallet needs a ledger account before it can authorize anything; `POST /v1/kyc` creates it (sponsor-paid), and
`prepare` answers `409 account_not_active` otherwise.

## Draw keeper

drand (PLAN.md, "Randomness"): `request_draw` makes the contract fix a future drand quicknet round; once that round
exists the keeper fetches its signature from `DRAND_URL`, checks it locally against the pinned quicknet key, decompresses
it to the 96-byte form the Soroban host takes and sends `settle_draw`. The keeper holds no secret and cannot influence the
winner; anyone could send the same transaction. If a round goes unsettled for an hour (drand down) the draw is requested
again with a new round.

## Not done yet

- TTL maintenance by the keeper (`ExtendFootprintTTL` of the contract instance/code and of live groups); the
  contract already extends what it touches.
- The `RpcChain` implementation has only been exercised read-only against testnet (ledger, account lookup); nothing
  has run against a deployed contract yet. Deploying needs the user's go-ahead.
