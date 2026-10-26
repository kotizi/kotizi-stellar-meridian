# Kotizi on Stellar — Implementation Plan (DRAFT, not approved)

Port of `colosseum-kotizi-monorepo` (Solana + EVM) for the Stellar Meridian hackathon. Stellar testnet only.
Tokenized real-estate ROSCA ("consórcio"): members join a group, pay a USDC quota each round, and each round one
eligible member is drawn as winner and claims the pool.

Product semantics come from the reference repo's `PLAN.md` (deviations 2, 5, 6, 8-12, 14) and `evm/src/Kotizi.sol`.
Architecture follows `Kotizi.sol` (key-value storage, one contract), not Anchor.

Toolchain: Rust stable with the `wasm32v1-none` target, `soroban-sdk` **28.0.0** (pinned to what OpenZeppelin Stellar Contracts
0.8.0 depends on, `stellar-tokens` crate; docs.rs shows 29.0.1 as latest, but mixing SDK majors with OZ is not possible),
`stellar-cli` for build/deploy/bindings. Commit `Cargo.lock`. Testnet only. Tests: `soroban-sdk` testutils.

## Items that need your decision (read these first)

These are where Stellar's real constraints disagree with `KICKOFF_PROMPT.md`. Marked **[DEVIATION]** below; strike or
amend as you did in the reference plan.

1. **[DEVIATION, approved 2026-10-25 as commit-reveal; superseded on `feat/drand-randomness` by on-chain drand verification] The randomness pattern in the kickoff does not exist on Soroban.** A contract cannot read any ledger hash:
   `Ledger` exposes only `sequence()`, `timestamp()`, `network_id()` (and a deprecated `protocol_version()`), verified in the
   soroban-sdk docs. "Commit to a future ledger, reveal by reading its hash" has no source for the hash. `env.prng()` exists but
   the SDK marks it "unsuitable for generating secrets or use in applications with low risk tolerance". See *Randomness* for
   the replacement (drand beacon verified in the contract). `request_draw`/`settle_draw` stay as the stable
   names, but their arguments change.
2. **[DEVIATION, approved 2026-10-25] Gasless via Soroban auth entries instead of a fee-bump of a user-signed transaction.** Fee-bump
   works, but it forces the user's account to be the inner transaction source (sequence numbers, user signs the envelope).
   On Soroban the user can instead sign only a `SorobanAuthorizationEntry` for `member.require_auth()`; the sponsor is the
   transaction source and pays everything, including rent for new entries. Same Privy raw-sign (hash in, signature out), but the
   backend builds the transaction from `{function, args}`, so it controls the whole envelope and the relay allowlist is
   simpler. Fee-bump stays as the fallback if auth-entry signing through Privy turns out awkward.
3. **[RISK] A Stellar account must exist on ledger before it can authorize anything.** A fresh Privy wallet has no ledger entry,
   so `require_auth` for it fails. The backend must activate accounts (sponsor-paid `CreateAccount`, funded with the base
   reserve) at onboarding, next to KYC. Unverified in detail; retired by one end-to-end test on testnet (task 5/6).
4. **[DEVIATION, extended on `feat/multi-token`: several tokens] Tokens are chosen per group from an admin allowlist.** Our own SEP-41
   test token (6 decimals, admin-mint faucet, no trustlines) stays the demo default, and real tokens can be enabled next to it:
   Circle's testnet USDC (classic asset `USDC:GBBD47IF...LFLA5`, SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`,
   **7 decimals**, verified on testnet) and USDT0 (mainnet only today, 7 decimals; no testnet deployment found). The contract
   therefore no longer assumes 6 decimals: it stores each token's decimals when the admin enables it, and quotas are in the
   token's base units. **Real (SAC) tokens need a trustline on every account that holds them**, the members and also the admin
   (the fee recipient): see *Risks of real tokens*.
5. **Persistent storage expires.** Soroban entries have a TTL and get archived. Not in the kickoff; handled in *TTL policy*.
6. **One contract, not two. [VERIFIED 2026-10-25 against OZ stellar-contracts 0.8.0 source]** The Kotizi contract implements
   `NonFungibleToken` (`type ContractType = Compose<(Base,)>`). `token_id` is `u32`, so `token_id = (group_id << 8) | index`
   with `group_id < 2^24`. Minting is `Base::mint_with_id(e, &to, token_id)` (uniqueness is our job: `index = members_joined`
   guarantees it). `transfer` / `transfer_from` have default bodies that call `ContractType`; we override them in our impl to
   check `Kyc(to)` first, then delegate. Ownership is the persistent entry `Owner(token_id)`, per-account balances persistent,
   approvals temporary (so they expire on their own). No cross-contract call for ownership: `pay_quota`/`claim_prize` call
   `Base::owner_of`. Burn is simply not implemented.
7. **Schedule needs your deadline.** I don't know the Meridian submission date; the table below is by task, not by day.

## Scope

In: KYC attestation, groups, join (mints membership NFT), pay quota, verifiable draw (drand beacon checked on-chain), claim prize,
demo seed script, gasless relay, backend keeper.
Out (same as reference): marketplace/resale, offers/bidding, default/penalty handling, real KYC provider, IPFS.
The prize is paid in test USDC from the collected pool; "real estate" is narrative.

## Contract state

Constructor (`__constructor`, runs at deploy, so there is no first-come `initialize`): `admin`, `kyc_authority`, `keeper` (the only account that may `request_draw`; it picks when a due draw starts, never its outcome, and if it goes silent a draw stalls but no funds are at risk). Fixed
afterwards. Tokens are enabled later with `add_token` (never removed: a group keeps its token).

Storage keys (`#[contracttype] enum DataKey`), one entry per key, never an array of 64 inside one entry:

| Key | Storage | Value |
|---|---|---|
| `Config` | instance | `{admin, kyc_authority, keeper}` |
| `Tokens` | instance | `Vec<TokenInfo{token, decimals}>`, at most 8 |
| `GroupCount` | instance | `u32` |
| `Kyc(Address)` | persistent | `u64` approved_at |
| `Group(u32)` | persistent | `Group` (below) |
| `Prize(u32, u32 index)` | persistent | `{gross: i128, won_round: u32}`, present only once the cota has won |
| `Paid(u32, u32 index)` | persistent | `i128` total_paid by that cota (feeds the "installment n of N" UI) |
| NFT keys | persistent | owner / balance / approvals as defined by the OZ `Base` variant, `token_id = (group_id << 8) \| index` |

`Group`: name, uri, quota `i128`, period `u64`, next_draw_ts `u64`, admin_fee_bps `u32`, max_members `u32` (2..=64),
members_joined, round, status (`Open | DrawPending | Completed`), `paid_bitmap: u64`, `won_bitmap: u64`,
`token: Address`, `unclaimed_bitmap: u64`, `unclaimed_total: i128`, `vault: i128` (this group's share of the contract's balance of its token),
last_winner_index, `draw_round: u64` (the drand round that decides the pending draw, 0 when none).
`group_id` is `u32` and must stay below 2^24 so it fits the NFT token id.

Why per-index `Prize`/`Paid` entries: Soroban meters the read/write footprint per invocation. `settle_draw` touches
`Group` + `Prize(winner)`; `claim_prize` touches `Group` + `Prize(i)` + the NFT owner entry + the token contract's balances.
Footprint per call stays at roughly 5-8 entries regardless of group size. Real limits are checked with simulation in the
tests, not assumed.

Eligibility = `paid_bitmap & !won_bitmap`. Winner = k-th set bit, `k = random % popcount`. Prize = paid members x quota, so the
vault can never owe more than it holds. Group completes after `max_members` rounds. Same rules as the reference (draws on
partial groups, prizes per cota, an unclaimed prize never blocks a draw, claimable any time).

### TTL policy (agreed direction 2026-10-25)

Testnet values read with `stellar network settings` (2026-10-25): `max_entry_ttl` = 3,110,400 ledgers (~180 days at 5 s/ledger),
`min_persistent_ttl` = 120,960 (~7 days), ledger close 5 s. Per-transaction limits relevant here: 200 disk-read entries,
200 write entries, 400 footprint entries, 400M instructions, entry size 64 KiB. Our calls touch well under 20 entries.
With the threshold at half the maximum, a touched entry is re-extended whenever less than ~90 days remain; the keeper's
external extension must therefore run at least every ~90 days (in practice daily, it is cheap).

Facts used (Stellar state-archival docs): entries have `liveUntilLedger`; persistent/instance entries are **archived** at TTL 0,
not deleted; instance storage shares one TTL with the contract instance; the maximum TTL is a network parameter measured from
the current ledger, so one extension lasts at most that long and "alive forever" means periodic extension, not one deposit
(a mechanism for indefinite rent was mentioned by Stellar devrel and is **unconfirmed**; none found in the docs).
Since protocol 23 (CAP-66), archived entries listed in a transaction's restore set are restored automatically before the
function runs; simulation fills that list, the transaction pays. A restored entry only gets ~4095 ledgers (~5.7 h) of TTL.

- Constants in one module: `TTL_THRESHOLD` and `TTL_EXTEND_TO`, with `EXTEND_TO` at the network maximum (read from
  `env.storage().max_ttl()`, not hard-coded) so one paid extension buys the longest life.
- `create_group` / `join_group` extend every entry they create to the maximum (the sponsor pays for it anyway).
- `pay_quota`, `settle_draw`, `claim_prize`, `approve_kyc`, NFT transfer extend every entry they touch (only when below the
  threshold, to avoid paying for no-op extensions).
- Instance storage (Config, GroupCount) is extended on every call. The contract instance and code have their own TTL
  (`env.deployer().extend_ttl*`): extended by the constructor and by the keeper.
- **No `bump_group` function in the contract.** The keeper keeps live groups alive from outside with the
  `ExtendFootprintTTL` operation on the group's entries (group, prizes, owners), plus the instance/code. The contract surface
  stays smaller. **Implemented and verified on testnet** (`Keeper.maintain`, `RpcChain.prepareExtend`): it takes the
  footprint of the read-only simulations of `cota_owners` and `winners` (which lists exactly those entries, with the instance
  and the code) and extends it when the closest entry has less than half of `TTL_EXTEND_TO_LEDGERS` (3,000,000) left; a
  healthy group costs nothing, an extension about 0.06 XLM. It covers the contract and every group not finished or with
  prizes still unclaimed, once at start and every `KEEPER_MAINTENANCE_INTERVAL_MS` (6 h).
- **Finding (testnet, 2026-10-25): the NFT library keeps the owner of each cota only ~30 days** (`~514,000` ledgers left on
  entries our own code had extended to ~3.1M). The contract's "extend to the maximum" policy cannot reach those entries, so a
  group quiet for a month would have its owners archived; this is why the keeper job is required, not optional.
- Restore: the relay's simulation fills the restore set, so the normal path needs no special code. The backend only handles
  the case where simulation says a restore is needed and the transaction would be too large, by submitting `RestoreFootprint`
  first. After any restore the keeper re-extends.
- A cota whose entries nobody touches or extends for longer than the maximum TTL is archived, not lost; the first transaction
  that touches it pays the restore. Accepted.

## Functions

| # | Function | Auth | Notes |
|---|---|---|---|
| 1 | `__constructor(admin, kyc_authority, keeper)` | - | empty token allowlist |
| 1b | `add_token(token)` | `admin` | reads `decimals()` (<= 18), rejects duplicates, at most 8 tokens; `tokens()` lists them |
| 2 | `approve_kyc(wallet)` | `kyc_authority` | sets `Kyc`; error if already approved |
| 3 | `create_group(name, uri, token, quota, max_members, period, admin_fee_bps)` | `admin` | `token` must be enabled; fee <= 10%, name <= 32 bytes, uri <= 200 bytes, quota > 0, period > 0 |
| 4 | `join_group(group_id, member)` | `member` | needs `Kyc(member)`; index = members_joined; not full; mints the NFT to `member` |
| 5 | `pay_quota(group_id, index)` | current NFT owner | status Open; one payment per round; pulls `quota` from the owner with `token.transfer`; verifies the contract's balance rose by exactly `quota` (rejects fee-on-transfer tokens) |
| 6 | `request_draw(group_id)` | none (permissionless) | after `next_draw_ts`; >= 1 eligible; status -> DrawPending; stores `draw_round` (a drand round 10 rounds ahead). Re-callable once `timestamp > round_time(draw_round) + DRAW_EXPIRY_SECS` |
| 7 | `settle_draw(group_id, signature)` | none (permissionless; the BLS check is the authorization) | `timestamp >= round_time(draw_round)`, valid quicknet signature of `draw_round`; picks winner, writes `Prize`, round += 1, clears paid_bitmap, `next_draw_ts = now + period` |
| 8 | `claim_prize(group_id, index)` | current NFT owner | cota must have won and not claimed; any round, any time; pays `gross - fee` to owner and `fee` to admin; once only |
| - | views | - | `get_group`, `get_prize`, `cota_owners(group_id)` (bulk), `is_kyc`, `group_count`, `config`, plus the OZ NFT views |

NFT transfers go through the OZ `transfer`; the Kotizi contract requires the **recipient** to have `Kyc` (as `KotiziMembership`
does). No burn exposed (a burned cota could never pay or claim).

Events (`env.events().publish`): `kyc_approved`, `group_created`, `member_joined`, `quota_paid`, `draw_requested`,
`draw_settled`, `prize_claimed`. Note Soroban RPC keeps events only a limited window, so the app never depends on them for
state; reads come from contract views.

## Randomness  **[DEVIATION from KICKOFF "Randomness", branch `feat/drand-randomness`]**

Constraint: no ledger hash readable in a contract; `env.prng()` is explicitly not for low-risk-tolerance use. The kickoff's
"commit to a future ledger's hash" therefore has no source on Soroban. The first design (keeper-secret commit-reveal, approved
2026-10-25) let the keeper simulate `settle_draw` and withhold or retry until it liked the winner. Replaced by:

**drand quicknet, verified inside the contract.** Soroban has BLS12-381 host functions (pairing check, hash-to-G1), so the
contract checks a drand beacon signature itself. quicknet (`52db9ba7...e971`, scheme `bls-unchained-g1-rfc9380`, period 3 s,
genesis 1692803367) signs `sha256(round as 8 big-endian bytes)` with a threshold key held by the League of Entropy.

- `request_draw(group_id)`: no signature needed. Freezes payments and the eligible set and stores
  `draw_round = floor((now - GENESIS) / 3) + 1 + DRAW_ROUND_DELAY` (10 rounds, 30 s ahead: a round that does not exist yet,
  with margin for the skew between ledger close time and drand's clock). A pending draw can be requested again (new round) once
  its round is `DRAW_EXPIRY_SECS` (1 h) old, so drand being down cannot lock a group.
- `settle_draw(group_id, signature)`: anyone may send it. Needs `timestamp >= round_time(draw_round)`, then verifies
  `e(signature, -g2) * e(H(sha256(round)), pk) == 1` against the pinned quicknet key. `random = sha256(signature || group_id)`;
  winner = k-th set bit of `paid & !won` (`draw_lib.rs`, unchanged). The host rejects off-curve and out-of-subgroup points.
- The host only takes uncompressed points, so the backend decompresses the signature drand serves (and verifies it locally
  first, so a lying relay can only cause a refusal).
- Cost measured in the test environment: `settle_draw` with verification ~27.7M CPU instructions (~7% of the 400M limit).
- Why this closes the gap: the round is fixed at request time, its signature is unique, nobody can know it earlier (the keeper
  included), and once published anyone can settle, so withholding does not help. No stored secrets, no `prng`.
- Residual trust: the drand threshold network must not collude (unbiasable otherwise), and the key hardcoded in
  `drand.rs` must be the real quicknet key (cross-checked against `api.drand.sh/<chain>/info` and a real beacon in the tests).
  A group's eligible set is public and fixed before the round exists; the group admin who creates the contract is still trusted
  for everything else.
- The verification is tested with real beacons (`test_beacons.rs`, 6 rounds): wrong round, wrong DST/message, missing negation,
  disabled verification and early settle are each caught by a test (mutation-checked).
- Seam: `request_draw`/`settle_draw` stay the interface; swapping the source later is local to `drand.rs` and `settle_draw`.

Winner derivation lives in a pure function (`draw_lib.rs`: popcount, nth set bit, `pick_winner`) with its own unit tests.

## Gasless  **[DEVIATION, see decision 2]**

```
App                          Privy wallet (raw sign)             API (sponsor key)
 │ POST /v1/tx/prepare {fn, args}  ───────────────────────────────►│ validate: fn in allowlist, address args == user wallet
 │◄──────── {auth entry preimage hash, tx xdr (sponsor source)} ───│ simulate (footprint, auth)
 │ sign hash with the user's wallet ──► signature
 │ POST /v1/tx/relay {signature, ...} ────────────────────────────►│ attach auth entry signature, sponsor signs, send, poll
```

Allowlist: only this contract's id and `join_group`, `pay_quota`, `claim_prize`; no other contract, no
`InvokeHostFunction` of other kinds, no classic operations from user input. Per-user daily limit and sponsor balance reserve as
in the reference `relay/budget.ts`. The sponsor never appears as `member`/`owner`.
`request_draw`/`settle_draw` are not relayed: `request_draw` needs the contract keeper's signature and `settle_draw` none, so the keeper sends them with its own key (separate from
the sponsor key) and pays the fees. `approve_kyc` and faucet mints use their own keys, as in the reference (three-plus separate server keys, files now).

Account activation (risk 3): onboarding also submits a sponsor-paid `CreateAccount` for the wallet if it has no ledger entry.

## Auth / wallets

Privy, Tier 2 for Stellar: no signing helper, raw hash signing. First real risk to retire: one real login on a real Privy app
confirming that `chain_type: 'stellar'` appears in linked accounts (both `@privy-io/node` on the backend and
`@privy-io/react-auth` on the frontend assume it today, marked unverified in code), and how an embedded Stellar wallet is
created. Done before contract code is wired to the frontend, not deferred.

## Backend (task 5)

Routes: `/v1/config`, `/v1/groups`, `/v1/groups/:id`, `/v1/groups/:id/members`, `/v1/me`, `/v1/kyc`, `/v1/faucet`,
`/v1/tx/prepare` + `/v1/tx/relay`, `/v1/groups/:id/draw`. Chain reads go through Soroban RPC simulation of the view functions
and `getLedgerEntries` (no `getProgramAccounts` equivalent: groups are enumerated by `group_count` then `get_group(i)`), with the
3-second cache of the reference. DB (Drizzle, already stripped): `sponsored_tx`, `kyc_approvals`, `faucet_claims`, no per-chain
namespacing. Keeper: poll due groups, `request_draw`; once the drand round exists, fetch and verify its signature, decompress it and
`settle_draw`; request again after expiry. Stateless: no secrets, nothing to lose on a restart.

## Frontend (task 6)

`stellar contract bindings typescript` for the typed client; `src/chain/stellar/client.ts` implements the existing
`KotiziClient`. Raw-sign flow in `privy-session.tsx` (currently `signer: null`). `src/chain/stellar/generated/` is gitignored
until frozen. The mock keeps working in the meantime.

## Risks of real tokens (USDC, USDT0)  *(feat/multi-token)*

- **Trustlines.** A classic asset needs a `ChangeTrust` on each holding account. Members: the transaction needs the member's own
  signature (it cannot be relayed like an auth entry), so onboarding needs one user-signed classic transaction through the
  Privy raw-sign flow, sponsored reserve. **Not implemented**; until then members must hold the trustline already.
  The **admin** receives the fee: without a trustline, `claim_prize` in that token reverts when `fee > 0`, blocking every
  claim. The admin must hold a trustline before the first group in a real token (or the group is created with fee 0).
- **Issuer controls.** USDT0 has clawback and revocable flags; USDC can freeze accounts. A frozen winner's claim reverts
  (retryable, nobody else is affected); a clawback can break the vault of a group (`InsufficientVault`, never over-pays).
- **Decimals are per token** (7 for both); the API exposes them with each group and the app must format with them.
- **Testnet USDC** comes from Circle's faucet (faucet.circle.com), not from our faucet, which only mints the demo token.
- **USDT0** has no testnet deployment found: it can be enabled on mainnet only, which is out of scope. A look-alike test token
  can stand in to test a 7-decimal group.

## Security checklist (every function)

`require_auth` on every authority (and the *right* address: NFT owner for pay/claim; `request_draw`/`settle_draw` take no signer on purpose); checked arithmetic on
every `i128`/`u32`; Soroban forbids contract re-entry by default, and state is still written before the token transfer; token
calls go only to the group's own token (enabled by the admin); pay-in balance delta verified; no double pay/claim/settle; draw cannot be
settled before its drand round exists or without that round's valid signature, nor replayed (the winner binds the group and the beacon is per round);
`vault >= unclaimed_total + pool` before recording a prize; recipient-KYC on NFT transfer; TTL extended on every touched entry;
negative tests for each.

Known and accepted: no KYC revocation; a winner who never claims only strands their own prize; the randomness caveats above.

## Task schedule

| Task | Output | Done when |
|---|---|---|
| 3 | KYC, `create_group`, `join_group` (+NFT), `pay_quota`, test token | tests incl. no-KYC, double pay, full group, wrong token, wrong signer. Verify the OZ NFT API first (decision 6). |
| 4 | `request_draw`, `settle_draw`, `claim_prize` | tests: early draw, none eligible, early/replayed settle, wrong or other-round beacon, permissionless settle, non-winner/double claim, full completion. |
| 5 | backend wired; account activation; prepare/relay; keeper | one real sponsored join + pay on testnet (asks you before deploy/funding) |
| 6 | bindings, client, Privy raw-sign | real login + join from the browser |
| 7 | seed script | test token, N keypairs, KYC, group, join + pay all (asks before running on testnet) |

## Open questions for you

1. Approve deviations 1, 2, 4, 6 (randomness, auth-entry gasless, own token, single contract)?
2. Meridian deadline, to turn the table into dates?
3. OK to create the Privy test app / do the real-login check myself, or will you do it (I won't touch your Privy secrets)?
