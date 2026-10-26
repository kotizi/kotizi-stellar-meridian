# Using the Kotizi contracts

Kotizi is a tokenized ROSCA ("consórcio") on Stellar/Soroban. Members join a group, pay a quota in a token every
round, and each round one member who has paid and not yet won is drawn and can claim the pool. Each seat in a group
is a transferable NFT (a **cota**): whoever owns the NFT pays and claims.

This guide shows how to use the contracts directly with the `stellar` CLI, from deploying them to a full round.
Everything here runs on **Stellar testnet only**. Nothing has been audited. See `PLAN.md` for the design and its
accepted risks, `DEPLOYMENTS.md` for the current testnet addresses, and `backend/README.md` for the gasless API.

- [1. The pieces](#1-the-pieces)
- [2. Setup](#2-setup)
- [3. Concepts](#3-concepts)
- [4. A full round with the CLI](#4-a-full-round-with-the-cli)
- [5. Function reference](#5-function-reference)
- [6. Errors](#6-errors)
- [7. Events](#7-events)
- [8. The draw (randomness)](#8-the-draw-randomness)
- [9. Tokens: test tokens, USDC, USDT0](#9-tokens-test-tokens-usdc-usdt0)
- [10. Gasless use through the backend](#10-gasless-use-through-the-backend)
- [11. Storage lifetime (TTL)](#11-storage-lifetime-ttl)
- [12. Build, test, deploy](#12-build-test-deploy)

## 1. The pieces

| Piece | What it is |
|---|---|
| `kotizi` (`contract/kotizi`) | The main contract: KYC, token allowlist, groups, quotas, draws, prizes, and the membership NFT (SEP-50, OpenZeppelin `Base`). |
| `test-usdc` (`contract/test-usdc`) | A SEP-41 token for demos. Decimals are a constructor argument, only the admin can `mint`. No trustlines needed. |
| Backend (`backend/`) | Optional. Pays fees for members (gasless), runs the draw keeper, onboards demo users. |

Roles, all set at deploy time or by the admin:

| Role | Who | Can |
|---|---|---|
| `admin` | the key given to the constructor | `add_token`, `create_group`; receives the fee of each prize |
| `kyc_authority` | second constructor argument | `approve_kyc` |
| member | any KYC-approved account | `join_group`, then pay/claim for the cotas it owns |
| anyone | any account | `request_draw`, `settle_draw`, all views |

## 2. Setup

You need the [`stellar` CLI](https://developers.stellar.org/docs/tools/cli) (v28.1.0 was used) and a funded testnet
account for each role. The commands below read the signing key from the `STELLAR_ACCOUNT` environment variable; it
accepts a secret seed, and the repo keeps seeds in `keypairs/*.key` (gitignored, never printed).

```bash
export K=<kotizi contract id>        # see DEPLOYMENTS.md
export TOKEN=<token contract id>     # a token enabled in the contract, see section 9
export STELLAR_ACCOUNT="$(cat keypairs/deployer.key)"   # whoever signs the next command
```

Reads and writes use the same command; add `--send=no` to a call to only simulate it (use it for views). Writes need
the signer to have an account on the ledger; a brand-new key must be created and funded first:

```bash
# amounts for classic operations are in stroops: 50000000 = 5 XLM
STELLAR_ACCOUNT="$(cat keypairs/sponsor.key)" stellar tx new create-account \
  --destination <G...> --starting-balance 50000000 --network testnet
```

**An account must exist on the ledger before it can authorize anything.** A wallet that has never been funded cannot
`join_group` or `pay_quota`. The backend does this for new users (sponsor-paid `CreateAccount`).

## 3. Concepts

**Group.** Created by the admin with a name, metadata `uri`, a `token`, a `quota` (per member, per round),
`max_members` (2 to 64), a `period` in seconds, and an `admin_fee_bps` (basis points of each prize, at most 1000 = 10%).
`group_id` is assigned in order from 0.

**Cota.** The n-th member to join gets cota index `n` (0-based) and an NFT whose token id is
`(group_id << 8) | index` (`token_id_of`). The NFT owner is the only one who can pay or claim for that cota; selling or
transferring the NFT moves those rights, including a prize already won. The new owner must be KYC-approved.

**Round.** A group runs `max_members` rounds. In each round every member pays one quota (`pay_quota`), then a draw picks
a winner among the cotas that **paid this round and have not won before**. A cota wins at most once. The winner's prize is
everything paid that round (`quota x number of payers`); `admin_fee_bps` of it goes to the admin on claim.

**Status.** `Open` (0): payments allowed. `DrawPending` (1): a draw was requested, payments are frozen until it is
settled. `Completed` (2): all rounds drawn; prizes can still be claimed.

**Bitmaps.** `paid_bitmap`, `won_bitmap` and `unclaimed_bitmap` in `Group` have bit `i` set for cota `i`
(`1 << i`), so `won_bitmap: 2` means cota 1 has won.

**Amounts are in the token's base units.** A quota of `10000000` is 10 tokens of a 6-decimal token and 1 token of a
7-decimal one. Each token's decimals are published by `tokens()`.

**Prizes are pulled, not pushed.** `settle_draw` only records the prize; the winner (NFT owner) calls `claim_prize`,
whenever they like, even after the group completed. An unclaimed prize never blocks the next draw.

## 4. A full round with the CLI

This is the exact sequence that was run against testnet to validate this document.

### 4.1 Admin: enable a token and create a group

```bash
export STELLAR_ACCOUNT="$(cat keypairs/deployer.key)"       # the admin

stellar contract invoke --id $K --network testnet -- add_token --token $TOKEN
stellar contract invoke --id $K --network testnet --send=no -- tokens
# [{"decimals":6,"token":"CADK..."}, ...]

stellar contract invoke --id $K --network testnet -- create_group \
  --name '"Docs"' --uri '"https://example.com/meta.json"' --token $TOKEN \
  --quota 5000000 --max_members 2 --period 20 --admin_fee_bps 100
# 2          <- the new group id
```

`add_token` reads the token's `decimals()` itself; it is not removable, and the list holds at most 8 tokens.
`create_group` only accepts an enabled token (`TokenNotSupported` otherwise).

### 4.2 KYC authority: approve members

```bash
STELLAR_ACCOUNT="$(cat keypairs/kyc.key)" \
  stellar contract invoke --id $K --network testnet -- approve_kyc --wallet <G...member>
```

There is no revocation, and approving twice fails (`AlreadyApproved`). The demo does this automatically
(`KYC_MODE=auto` in the backend); a real deployment would plug in a KYC provider.

### 4.3 Member: get funds, join, pay

Members need the group's token. With the demo test token the token admin mints it:

```bash
STELLAR_ACCOUNT="$(cat keypairs/deployer.key)" \
  stellar contract invoke --id $TOKEN --network testnet -- mint --to <G...member> --amount 100000000
```

Then the member signs for themselves:

```bash
export STELLAR_ACCOUNT="$(cat keypairs/member.key)"

stellar contract invoke --id $K --network testnet -- join_group --group_id 2 --member <G...member>
# 0          <- the cota index (and NFT) the member received

stellar contract invoke --id $K --network testnet -- pay_quota --group_id 2 --index 0
```

`pay_quota` pulls `quota` of the group's token from the cota owner; one payment per cota per round, only while the
group is `Open`. Joining is allowed at any time until the group is full, so members can still join mid-way.

### 4.4 Anyone: draw

A draw is due once the ledger time passes `next_draw_ts` (group creation time + `period`, then each settlement + `period`)
and at least one eligible cota has paid. **Nobody needs to be trusted for this step.** First request it:

```bash
stellar contract invoke --id $K --network testnet -- request_draw --group_id 2
# event DrawRequested ... draw_round: 33384627
```

This freezes payments and fixes the future drand round that decides the draw (`draw_round`, about 30 seconds ahead). Wait
until that round has been published, fetch its signature and settle. From the `backend/` folder:

```bash
R=$(stellar contract invoke --id $K --network testnet --send=no -- get_group --group_id 2 \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).draw_round))')

SIG=$(cd backend && npx tsx scripts/beacon.ts $R)      # exits 1 with "not published yet" until the round exists

stellar contract invoke --id $K --network testnet -- settle_draw --group_id 2 --signature $SIG
# event DrawSettled ... winner_index: 1, prize_pool: "10000000"
```

`settle_draw` needs no authorization: any account can send it, and the contract verifies the signature itself. See
[section 8](#8-the-draw-randomness) for what is checked. The backend keeper does both steps automatically
(`KEEPER_ENABLED=true`), and `POST /v1/groups/:id/draw` triggers the next step on demand.

### 4.5 Winner: claim

```bash
stellar contract invoke --id $K --network testnet --send=no -- winners --group_id 2
# [{"gross":"10000000","index":1,"won_round":0}]

STELLAR_ACCOUNT="$(cat keypairs/winner.key)" \
  stellar contract invoke --id $K --network testnet -- claim_prize --group_id 2 --index 1
# event PrizeClaimed ... prize: "9900000", fee: "100000"
```

The current owner of the winning cota's NFT receives `gross - fee`; the admin receives `fee`. Claiming twice fails
(`AlreadyClaimed`); a cota that has not won fails with `NotWinner`.

After `max_members` rounds the group is `Completed`; nothing more can be paid or drawn, and remaining prizes stay claimable.

### 4.6 Read state

Views can be called by anyone (set `STELLAR_ACCOUNT` to any funded account for the simulation):

```bash
stellar contract invoke --id $K --network testnet --send=no -- get_group --group_id 2
stellar contract invoke --id $K --network testnet --send=no -- cota_owners --group_id 2
stellar contract invoke --id $K --network testnet --send=no -- is_kyc --wallet <G...>
```

## 5. Function reference

`Result<_, Error>` means the call fails with one of the [errors](#6-errors) (also visible in the contract spec and in
generated bindings). **Auth** is who must sign.

### Setup

| Function | Auth | Does |
|---|---|---|
| `__constructor(admin, kyc_authority)` | deployer (at deploy) | Stores the roles. No token yet. |
| `add_token(token) -> Result<()>` | admin | Enables a SEP-41 token (decimals read from it, at most 18; at most 8 tokens; no duplicates). |
| `approve_kyc(wallet) -> Result<()>` | kyc_authority | Marks the wallet as KYC-approved. Once only. |
| `create_group(name, uri, token, quota, max_members, period, admin_fee_bps) -> Result<u32>` | admin | Creates a group in an enabled token and returns its id. Name up to 32 bytes, uri up to 200, `quota > 0`, 2 to 64 members, `period > 0`, fee up to 1000 bps. |

### Members

| Function | Auth | Does |
|---|---|---|
| `join_group(group_id, member) -> Result<u32>` | member | Needs KYC. Mints the next cota NFT to `member` and returns its index. Fails when the group is full. |
| `pay_quota(group_id, index) -> Result<()>` | current NFT owner | Group must be `Open`. Pulls `quota` of the group's token; once per cota per round. Fails if the contract's balance does not rise by exactly `quota` (fee-on-transfer tokens are rejected). |
| `claim_prize(group_id, index) -> Result<()>` | current NFT owner | Pays `gross - fee` to the owner and `fee` to the admin, in the group's token. Once per prize. |

### Draw

| Function | Auth | Does |
|---|---|---|
| `request_draw(group_id) -> Result<()>` | none | Needs `now >= next_draw_ts` and at least one cota that paid and has not won. Freezes payments and stores `draw_round`. If a draw is already pending it can only be requested again an hour after its round was published. |
| `settle_draw(group_id, signature: BytesN<96>) -> Result<()>` | none | Verifies the drand signature of `draw_round`, picks the winner, records the prize, advances the round and sets `next_draw_ts = now + period`. Moves no tokens. |

### Views (no signature)

| Function | Returns |
|---|---|
| `get_group(group_id)` | the `Group` (fields below) |
| `get_prize(group_id, index)` | `Option<Prize{gross, won_round}>` |
| `winners(group_id)` | every cota that has won with its prize, by cota index, in one call |
| `cota_owners(group_id)` | the current owner of every cota joined so far, by index |
| `total_paid(group_id, index)` | total a cota has paid across rounds |
| `group_count()` | number of groups |
| `tokens()` | enabled tokens `[{token, decimals}]` |
| `config()` | `{admin, kyc_authority}` |
| `is_kyc(wallet)` | bool |
| `token_id_of(group_id, index)` | the NFT token id of a cota |

`Group` fields: `name, uri, token, quota, period, next_draw_ts, admin_fee_bps, max_members, members_joined, round,
status (0 Open, 1 DrawPending, 2 Completed), paid_bitmap, won_bitmap, unclaimed_bitmap, unclaimed_total, vault,
last_winner_index, draw_round`. `vault` is the group's own share of the contract's balance in its token (always at least
`unclaimed_total`); different groups, and different tokens, never share a vault.

### Membership NFT (SEP-50)

`owner_of`, `balance`, `transfer`, `transfer_from`, `approve`, `approve_for_all`, `get_approved`,
`is_approved_for_all`, `name` ("Kotizi Cota"), `symbol` ("COTA") and `token_uri` (the group's `uri`, shared by all its
cotas). `transfer` and `transfer_from` additionally require the **recipient** to be KYC-approved. The rights to pay and
claim follow the NFT.

## 6. Errors

| Code | Name | When |
|---:|---|---|
| 1 | `InvalidTokenDecimals` | `add_token` with a token reporting more than 18 decimals |
| 2 | `AlreadyApproved` | `approve_kyc` for a wallet already approved |
| 3 | `NotKyc` | `join_group` or an NFT transfer to a wallet without KYC |
| 4 | `GroupNotFound` | unknown `group_id` |
| 5 | `InvalidQuota` | `create_group` with `quota <= 0` |
| 6 | `InvalidMaxMembers` | outside 2 to 64 |
| 7 | `InvalidPeriod` | `period == 0` |
| 8 | `FeeTooHigh` | more than 1000 bps |
| 9 | `NameTooLong` | name over 32 bytes |
| 10 | `UriTooLong` | uri over 200 bytes |
| 11 | `GroupFull` | `join_group` when all cotas are taken |
| 12 | `GroupNotOpen` | `pay_quota` while a draw is pending or after completion; `request_draw` after completion |
| 13 | `CotaNotFound` | index beyond the members joined so far |
| 14 | `AlreadyPaid` | second `pay_quota` for a cota in the same round |
| 15 | `UnsupportedToken` | the token moved a different amount than the quota (fee-on-transfer) |
| 16 | `TooManyGroups` | more groups than fit the NFT id space (2^24) |
| 17 | `MathOverflow` | checked arithmetic failed |
| 18 | `DrawNotDue` | `request_draw` before `next_draw_ts` |
| 19 | `NoEligibleMembers` | nobody paid who has not already won |
| 20 | `DrawNotExpired` | `request_draw` while a draw is pending and not yet an hour old |
| 21 | `NoDrawPending` | `settle_draw` with no pending draw (including a replay) |
| 22 | `DrawTooEarly` | `settle_draw` before the drand round is due |
| 23 | `InvalidBeacon` | the signature is not the drand signature of `draw_round` |
| 24 | `InsufficientVault` | the group's vault cannot cover the prize (never over-pays) |
| 25 | `NotWinner` | `claim_prize` for a cota that has not won |
| 26 | `AlreadyClaimed` | `claim_prize` twice |
| 27 | `TokenNotSupported` | `create_group` with a token that was not enabled |
| 28 | `TokenAlreadyAdded` | `add_token` twice |
| 29 | `TooManyTokens` | `add_token` beyond 8 |

On the CLI an error shows as `Error(Contract, #N)`; a failed call changes no state. Failures of the NFT transfer
(`NotKyc` for the recipient) and of authorization come back as a panic with the same code or a host auth error.

## 7. Events

| Event | Topics | Data |
|---|---|---|
| `kyc_approved` | wallet | |
| `token_added` | token | decimals |
| `group_created` | group_id | name, token, quota, max_members, period, admin_fee_bps |
| `member_joined` | group_id, member | index, members_joined |
| `quota_paid` | group_id, payer | index, round, amount |
| `draw_requested` | group_id | round, draw_round |
| `draw_settled` | group_id | round, winner_index, prize_pool, completed |
| `prize_claimed` | group_id, winner | round, index, prize (net), fee |

## 8. The draw (randomness)

Soroban contracts cannot read a ledger hash, and `env.prng()` is explicitly not meant for applications that cannot
tolerate manipulation. Kotizi therefore verifies a **drand** beacon inside the contract:

1. `request_draw` stores `draw_round`: the drand **quicknet** round published 10 rounds (30 s) after the ledger time
   of the request. That round did not exist yet, and nobody, the requester and the keeper included, can know its
   signature in advance.
2. When the round exists, anyone fetches its signature from any drand relay and calls `settle_draw`. The contract checks
   the BLS12-381 signature against the quicknet public key hardcoded in `contract/kotizi/src/drand.rs`
   (`e(sig, -g2) * e(H(sha256(round)), pk) == 1`, using the Soroban host's pairing functions). Verification costs about
   27.7M CPU instructions, roughly 7% of a transaction's limit, and about 0.046 XLM in fees on testnet.
3. The random value is `sha256(signature || group_id)`, and the winner is the k-th set bit of `paid & !won` with
   `k = random mod (number of eligible cotas)`. The signature of a round is unique, so the outcome cannot be retried or
   steered, and since it is public once published, withholding the transaction does not help either.

Signature format: Soroban accepts only **uncompressed** points, but drand serves compressed ones. `backend/scripts/beacon.ts <round>`
fetches a round, verifies it locally against the same key, decompresses it and prints the 96-byte hex that `--signature`
expects. It exits with status 1 and "not published yet" while the round does not exist. Do not call `settle_draw`
before the round exists: the contract answers `DrawTooEarly`, and with a wrong signature `InvalidBeacon`.

If drand were unreachable for an hour after the round, `request_draw` can be called again (a new round is stored), so a
group cannot be locked forever.

What you still trust: that the drand threshold network does not collude, and that the public key in `drand.rs` is the
real quicknet key (it is checked against `api.drand.sh/<chain-hash>/info` and a real beacon in the tests).

## 9. Tokens: test tokens, USDC, USDT0

A group collects and pays in **one** token, chosen at creation from the tokens the admin enabled. Each group's balance is
separate, so one contract can run groups in several tokens at once. The contract never assumes a number of decimals.

| Token | Where | Decimals | Notes |
|---|---|---:|---|
| demo token (`test-usdc`) | any deployment of `contract/test-usdc` | constructor argument | admin-mint, no trustlines; the faucet mints this one |
| Circle testnet USDC | SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (asset `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`) | 7 (read on-chain) | enabled on the current deployment |
| USDT0 | mainnet only (issuer `GATISXX6BZ6NC7IKQBY37CJD4SOZL3CYZJWXEDG6JVIY4WBS6KXJHN6Q`) | 7 | no testnet deployment found, so it cannot be tested here |

To use a Stellar Asset Contract such as USDC: derive its id from the asset
(`stellar contract id asset --asset USDC:<issuer> --network testnet`), then `add_token` it and create a group with it.

**Real tokens need trustlines.** A classic asset can only be held by an account that has a trustline to the issuer:

- every **member** needs one before paying or receiving a prize. This is a classic operation signed by the member
  (it cannot be relayed like a contract authorization), and it is **not automated yet**;
- `GET /v1/me` reports `trustlines` per token for each wallet (`false` means a Stellar asset the wallet cannot hold yet, `null`
  while its account is not active), so the app can block "pay" and explain what is missing; paying anyway answers `422 missing_trustline`;
- the **admin** needs one too, because `claim_prize` also pays the fee to the admin. Without it every claim in that
  token fails while `admin_fee_bps > 0`. Create the group with fee 0 or give the admin a trustline first;
- testnet USDC comes from Circle's faucet (`faucet.circle.com`), not from Kotizi's faucet.

Issuer controls also apply: USDT0 has clawback and revocable flags, USDC can freeze accounts. A frozen winner's claim
fails and can be retried later; it affects nobody else, and the contract never pays more than the group's vault holds.

## 10. Gasless use through the backend

Members do not need XLM. The backend (`backend/`) is the transaction source and pays every fee; the member only signs an
authorization payload with their wallet (never a transaction envelope).

```
POST /v1/kyc                 activates the wallet's account on the ledger and approves KYC (demo)
POST /v1/faucet              mints the demo token (FAUCET_TOKEN), once a day per wallet
POST /v1/tx/prepare          {fn: join_group | pay_quota | claim_prize, groupId, index?} -> payloads to sign
POST /v1/tx/relay            {transaction, validUntilLedger, signatures} -> sends it with the sponsor's signature
POST /v1/groups/:id/draw     runs the next draw step (request or settle) now
GET  /v1/config  /v1/groups  /v1/groups/:id  /v1/groups/:id/members  /v1/me   (/v1/me: balance and trustline per token)
```

The relay accepts only `join_group`, `pay_quota` and `claim_prize` on the Kotizi contract, only authorizations from the
caller's own wallets, and for `pay_quota` only the transfer of the group's token from the member to the contract. It
re-validates everything between the two steps. `backend/scripts/journey.ts` runs a whole group (onboarding, join, pay,
draw, claim) against a local API with `AUTH_MODE=dev`:

```bash
cd backend && cp .env.example .env     # set CONTRACT_ID, key files, FAUCET_TOKEN ...
npm install --legacy-peer-deps && npm start
GROUP_ID=0 MEMBERS=2 npx tsx scripts/journey.ts
```

The backend answers JSON; its responses (config, group, the user's wallets with balance and trustline per token) and every error code
are documented, with real examples, in `backend/README.md`. In short:

- `GET /v1/me` returns, for each wallet, `balances` and `trustlines` keyed by token contract id. `trustlines[token] === false`
  means a Stellar asset (USDC, USDT0) the wallet cannot hold yet, `null` that its account is not active; the app should block
  "pay" in that token and explain what is missing. Paying anyway answers `422 missing_trustline`.
- `GET /v1/groups/:id` carries the group's token as `mint` and its `decimals`; amounts are strings in base units.
- The faucet mints `FAUCET_AMOUNT_USDC` whole tokens of `FAUCET_TOKEN`, scaled by that token's decimals.

See `backend/README.md` for every environment variable.

## 11. Storage lifetime (TTL)

Soroban storage entries expire unless their TTL is extended. Every call extends what it touches to the network maximum
(about 180 days on testnet) whenever less than half remains, so an active group keeps itself alive. A group nobody
touches for months can have its entries archived; Protocol 23 restores archived entries automatically when a
transaction needs them (the simulation lists them), at a small cost.

**One exception: the owner of each cota.** The NFT library (OpenZeppelin) keeps those entries only about 30 days after they
were last touched, much less than the rest, and the contract cannot extend entries it does not own. So a group left alone for
a month would have its owners archived (they would be restored by the next transaction that needs them, at a cost, but reads
such as `cota_owners` would first need a restore).

The backend keeper therefore does the upkeep from outside, with `ExtendFootprintTTL`: when it starts and every 6 hours
(`KEEPER_MAINTENANCE_INTERVAL_MS`) it extends the contract and every group that is not finished or still has prizes to claim,
to `TTL_EXTEND_TO_LEDGERS` (3,000,000 ledgers, about 170 days), but only if the closest entry has less than half of that left.
A healthy group costs nothing; an extension costs about 0.06 XLM. The same can be done by hand with the CLI, for example
`stellar contract extend --id $K --ledgers-to-extend 3000000 --source-account <key> --network testnet` for the contract
instance (add `--key` for a specific entry). Reads made by the backend restore archived entries first, paid by the sponsor, so
a long-idle group still answers.

## 12. Build, test, deploy

```bash
cd contract
cargo test                      # 28 tests, with real drand beacons (no mocks)
cargo clippy --all-targets && cargo fmt --check
stellar contract build          # kotizi.wasm and test_usdc.wasm in target/wasm32v1-none/release/
```

Use `stellar contract build`, not plain `cargo build`: the SDK rejects the wasm target otherwise.

```bash
export STELLAR_ACCOUNT="$(cat ../keypairs/deployer.key)"

# demo token with 6 decimals
stellar contract deploy --wasm target/wasm32v1-none/release/test_usdc.wasm --network testnet \
  -- --admin <G...admin> --decimals 6

# kotizi
stellar contract deploy --wasm target/wasm32v1-none/release/kotizi.wasm --network testnet \
  -- --admin <G...admin> --kyc_authority <G...kyc>

stellar contract invoke --id <kotizi> --network testnet -- add_token --token <token>
```

A deploy uploads the wasm and pays its rent, which cost about **51 XLM** per `kotizi` deploy on testnet, so the paying
account needs that much available. The payer does not have to be the admin. The contract is **not upgradeable**: changing
its code or its stored types means a new deploy with a new id (and the old groups stay on the old contract).

To generate a typed TypeScript client for the frontend, use the official bindings tool against the deployed contract:

```bash
stellar contract bindings typescript --network testnet --contract-id <kotizi> --output-dir <dir>
```

The contract spec includes the `Result<_, Error>` signatures and the error names (checked with the current deployment): the
generated client types every call as `AssembledTransaction<Result<...>>` and carries a `{code: {message}}` table for the
errors. `backend/scripts/beacon.ts` is the way to produce the `signature` argument (`Buffer`) for `settle_draw`.

## 13. Known limits

- **A winner can stop paying.** The prize of a round is `quota x the members who paid that round`, and after winning nothing forces a
  member to keep paying, so the others bear that risk. Default and penalty handling are out of the project's scope; the usual
  mitigation (keeping part of each prize in escrow until the group completes) is not implemented.
- **Trustlines are reported, not created.** A member must already hold the trustline for a Stellar asset before paying in it.
- **Not upgradeable, not audited.** Changing the contract means a new deployment with a new id; there is no emergency pause (the admin
  cannot move funds, and a pause would be a new power over them).
- **Testnet only.** The backend refuses any other network.
