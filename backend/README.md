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

Every role key is a secret seed (`S...`), never logged. Give each role **either** a file (`*_KEYFILE`, kept outside git)
**or** the seed itself in a secret environment variable (`*_SECRET`, for hosts without files such as Railway). Setting both
for one role is refused at start-up, and a malformed seed is rejected without echoing it. One key may serve several roles.

| Key | Role |
|---|---|
| `SPONSOR_KEYFILE` / `SPONSOR_SECRET` | **required.** Source and fee payer of relayed transactions; creates accounts for new wallets |
| `KEEPER_KEYFILE` / `KEEPER_SECRET` | signs `request_draw` / `settle_draw`, pays its own fee (defaults to the sponsor) |
| `KYC_KEYFILE` / `KYC_SECRET` | must be the contract's `kyc_authority` (`approve_kyc`); needed with `KYC_MODE=auto` |
| `MINT_KEYFILE` / `MINT_SECRET` | must be the admin of `FAUCET_TOKEN` (faucet mint); needed with `FAUCET_ENABLED` |
| `FAUCET_TOKEN` | the demo test token the faucet mints; required with `FAUCET_ENABLED` |

Minimum to deploy on a host with only environment variables (Railway): `CONTRACT_ID`, `SPONSOR_SECRET`, `DATABASE_URL`
(Postgres; migrations run at start) and `PRIVY_APP_ID` / `PRIVY_APP_SECRET`, plus `CORS_ORIGINS` for the frontend's URL.
Add `KYC_MODE=auto` + `KYC_SECRET`, `FAUCET_ENABLED=true` + `MINT_SECRET` + `FAUCET_TOKEN`, and `KEEPER_ENABLED=true` for the
demo features (the keeper also does the TTL upkeep: see `docs.md`, section 11). `tsx` is a regular dependency, so `npm ci --omit=dev` followed by `npm start` works.
An empty variable counts as unset (its default applies), and with `NODE_ENV=production` the API refuses to start without
`DATABASE_URL` rather than silently using the embedded, non-persistent database.

The admin signs `create_group` with their own wallet (not here), so no admin key lives on the server.

## Endpoints

| | |
|---|---|
| `GET /healthz`, `GET /v1/config` | liveness; contract id, admin, enabled tokens (with decimals), sponsor, KYC/faucet modes |
| `GET /v1/groups`, `/v1/groups/:id`, `/v1/groups/:id/members` | group state (bigints as strings, bitmaps as index lists), cota owners |
| `GET /v1/me` | the user's wallets (account active, KYC, balance and trustline per enabled token) and cotas |
| `POST /v1/kyc` | creates the wallet's account if missing, then `approve_kyc` (`KYC_MODE=auto`) |
| `POST /v1/faucet` | mints `FAUCET_AMOUNT_USDC` whole tokens of `FAUCET_TOKEN` (scaled by that token's decimals), one claim per wallet per day |
| `POST /v1/tx/prepare`, `POST /v1/tx/relay` | gasless `join_group` / `pay_quota` / `claim_prize` (below) |
| `POST /v1/groups/:id/draw` | "draw now": the keeper runs the next `request_draw` / `settle_draw` step |

Errors are `{code, message}`; a contract failure is `422 {code: "contract_error", message: "<ContractErrorName>"}`.
Everything except `GET /healthz`, `GET /v1/config` and the group reads needs `Authorization: Bearer <token>` (Privy access
token; `dev:<G-address>` in `AUTH_MODE=dev`).

### Responses (captured from the running API on testnet)

`GET /v1/config`

```json
{
  "contractId": "CDLG5PWR…", "rpcUrl": "https://soroban-testnet.stellar.org",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "admin": "GBG2Y3PQ…", "kycAuthority": "GCZDM42G…", "sponsor": "GCUX6WIX…",
  "tokens": [ { "token": "CADKFUPE…", "decimals": 6 }, { "token": "CAT65NQ3…", "decimals": 7 }, { "token": "CBIELTK6…", "decimals": 7 } ],
  "kycMode": "auto", "faucet": true, "faucetToken": "CADKFUPE…", "faucetAmountUsdc": 1000
}
```

`GET /v1/groups/:id` (all amounts are strings in the token's base units; bitmaps are lists of cota indexes)

```json
{
  "id": "2", "groupId": 2, "address": "CDLG5PWR…", "organizer": "GBG2Y3PQ…",
  "mint": "CADKFUPE…", "decimals": 6,
  "name": "Docs", "uri": "https://example.com/d",
  "quotaAmount": "5000000", "maxMembers": 2, "membersJoined": 2, "periodSecs": "20", "adminFeeBps": 100,
  "round": 1, "nextDrawTs": "1792957292", "status": "Open",
  "drawSource": "drand", "drawRound": "0", "lastWinnerIndex": 1,
  "winners": [ { "index": 1, "round": 0, "prize": "10000000", "claimed": true } ],
  "unclaimedIndexes": [], "unclaimedTotal": "0", "paidIndexes": [], "wonIndexes": [1], "vault": "0"
}
```

`mint` is the group's token and `decimals` its decimals (`null` if the token is no longer enabled). `status` is `Open`,
`DrawPending` or `Completed`; `drawRound` is the drand round that decides a pending draw (`"0"` when none).

`GET /v1/me`

```json
{
  "userId": "…",
  "wallets": [ {
    "address": "GBG2Y3PQ…", "active": true, "kyc": false,
    "balances":   { "CADKFUPE…": "1700000", "CAT65NQ3…": "4000000", "CBIELTK6…": "0" },
    "trustlines": { "CADKFUPE…": true,      "CAT65NQ3…": true,      "CBIELTK6…": false }
  } ],
  "cotas": [ { "group": "2", "groupName": "Docs", "index": 1, "owner": "G…", "paidThisRound": false,
               "alreadyWon": true, "canClaim": false, "prize": "10000000" } ]
}
```

`balances` and `trustlines` are keyed by token contract id for every enabled token. `trustlines[token] === false` means the
token is a Stellar asset (USDC, USDT0) the wallet has no trustline for: its balance reads `"0"`, it cannot pay in or
receive prizes of that token, and `prepare` for a `pay_quota` there answers `422 missing_trustline`. The app should
block "pay" and explain it. `null` means the account is not active yet, so it cannot be known; plain contract tokens
(the demo tokens) never need a trustline and always read `true`.

### Error codes

| Status | `code` | When |
|---:|---|---|
| 400 | `bad_request`, `bad_group_id`, `no_wallet` | invalid body or group id; the user has no Stellar wallet yet |
| 401 | `unauthorized` | missing or invalid bearer token |
| 403 | `not_user_wallet` | a wallet or authorization that is not one of the user's |
| 404 | `not_found` | unknown group |
| 409 | `account_not_active` | the wallet has no ledger account yet: call `POST /v1/kyc` first |
| 409 | `authorization_expired` | the signature expired between `prepare` and `relay`: prepare again |
| 422 | `contract_error` | the contract rejected the call; `message` is the error name (see `docs.md`, section 6) |
| 422 | `missing_trustline` | the wallet has no trustline for the group's token |
| 422 | `transaction_failed`, `draw_failed` | the network or the keeper step failed |
| 429 | `user_limit`, `faucet_limit` | per-user daily limits |
| 501 | `kyc_unavailable`, `faucet_disabled` | the feature is off in this deployment |
| 503 | `sponsor_budget`, `sponsor_funds`, `faucet_misconfigured` | the sponsor's daily budget or funds ran out; `FAUCET_TOKEN` is not enabled in the contract |
| 400 | `wrong_source`, `one_operation`, `forbidden_*`, `no_authorization`, `bad_arguments`, `bad_signatures`, `bad_transaction`, `bad_expiry`, `fee_too_high` | the relay refused the transaction (see below) |

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

### Upkeep: keeping the contract's entries alive

Soroban storage entries expire unless their lifetime is extended, and the NFT library keeps the owner of each cota only
~30 days, which the contract cannot extend itself. So the keeper (`KEEPER_ENABLED=true`) also does the upkeep, once shortly
after start and then every `KEEPER_MAINTENANCE_INTERVAL_MS` (default 6 h): for the contract and for every group that is not
finished or still has unclaimed prizes, it plans an `ExtendFootprintTTL` from the footprint of the read simulations of
`cota_owners` and `winners` (exactly the entries those reads touch), and sends it **only if the closest entry has less than
half of `TTL_EXTEND_TO_LEDGERS` left** (default 3,000,000 ledgers, ~170 days; the testnet maximum is 3,110,400). A healthy
group costs nothing; an extension costs about 0.06 XLM, paid by the keeper account, and is recorded in `sponsored_tx` as
`extend_ttl`. One failing target is logged and does not stop the others. Reads the API makes restore archived entries first
(paid by the sponsor), so a long-idle group still answers.

| Variable | Default | |
|---|---|---|
| `KEEPER_ENABLED` | `false` | turns on draws and upkeep |
| `KEEPER_INTERVAL_MS` | `5000` | draw steps |
| `KEEPER_MAINTENANCE_INTERVAL_MS` | `21600000` | upkeep checks |
| `TTL_EXTEND_TO_LEDGERS` | `3000000` | how far entries are extended; must stay under the network maximum |
| `DRAND_URL` | `https://api.drand.sh` | beacon relay (signatures are verified locally, so it is not trusted) |

## Not done yet

- Creating a trustline for a member (a classic operation the member must sign); `/v1/me` only reports who lacks one.
- Nothing stops a winner from paying no more quotas after winning (default handling is out of scope, see PLAN.md).
- `Paid(group, cota)` counters are not part of the upkeep (an informational total; a transaction that needs an archived one
  restores it).
