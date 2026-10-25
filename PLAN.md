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

1. **[DEVIATION, approved 2026-10-25: commit-reveal with keeper secret] The randomness pattern in the kickoff does not exist on Soroban.** A contract cannot read any ledger hash:
   `Ledger` exposes only `sequence()`, `timestamp()`, `network_id()` (and a deprecated `protocol_version()`), verified in the
   soroban-sdk docs. "Commit to a future ledger, reveal by reading its hash" has no source for the hash. `env.prng()` exists but
   the SDK marks it "unsuitable for generating secrets or use in applications with low risk tolerance". See *Randomness* for
   the replacement I propose (keeper-secret commit-reveal mixed with `prng`). `request_draw`/`settle_draw` stay as the stable
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
4. **[DEVIATION] Token = our own SEP-41 test token contract, not a classic-asset SAC.** A SAC needs a trustline (extra reserve and
   an extra sponsored operation) for every wallet. A plain contract token has balances in contract storage, no trustlines. 6
   decimals, admin-mint (faucet). The kickoff allowed either.
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

In: KYC attestation, groups, join (mints membership NFT), pay quota, verifiable-ish draw (commit-reveal), claim prize,
demo seed script, gasless relay, backend keeper.
Out (same as reference): marketplace/resale, offers/bidding, default/penalty handling, real KYC provider, IPFS.
The prize is paid in test USDC from the collected pool; "real estate" is narrative.

## Contract state

Constructor (`__constructor`, runs at deploy, so there is no first-come `initialize`): `admin`, `kyc_authority`, `token`
(address of the test token). Fixed afterwards.

Storage keys (`#[contracttype] enum DataKey`), one entry per key, never an array of 64 inside one entry:

| Key | Storage | Value |
|---|---|---|
| `Config` | instance | `{admin, kyc_authority, token}` |
| `GroupCount` | instance | `u32` |
| `Kyc(Address)` | persistent | `u64` approved_at |
| `Group(u32)` | persistent | `Group` (below) |
| `Prize(u32, u32 index)` | persistent | `{gross: i128, won_round: u32}`, present only once the cota has won |
| `Paid(u32, u32 index)` | persistent | `i128` total_paid by that cota (feeds the "installment n of N" UI) |
| NFT keys | persistent | owner / balance / approvals as defined by the OZ `Base` variant, `token_id = (group_id << 8) \| index` |

`Group`: name, uri, quota `i128`, period `u64`, next_draw_ts `u64`, admin_fee_bps `u32`, max_members `u32` (2..=64),
members_joined, round, status (`Open | DrawPending | Completed`), `paid_bitmap: u64`, `won_bitmap: u64`,
`unclaimed_bitmap: u64`, `unclaimed_total: i128`, `vault: i128` (this group's share of the contract's token balance),
last_winner_index, draw commit data (`commitment: BytesN<32>`, `commit_ledger: u32`, `committer: Address`).
`group_id` is `u32` and must stay below 2^24 so it fits the NFT token id.

Why per-index `Prize`/`Paid` entries: Soroban meters the read/write footprint per invocation. `settle_draw` touches
`Group` + `Prize(winner)`; `claim_prize` touches `Group` + `Prize(i)` + the NFT owner entry + the token contract's balances.
Footprint per call stays at roughly 5-8 entries regardless of group size. Real limits are checked with simulation in the
tests, not assumed.

Eligibility = `paid_bitmap & !won_bitmap`. Winner = k-th set bit, `k = random % popcount`. Prize = paid members x quota, so the
vault can never owe more than it holds. Group completes after `max_members` rounds. Same rules as the reference (draws on
partial groups, prizes per cota, an unclaimed prize never blocks a draw, claimable any time).

### TTL policy (agreed direction 2026-10-25; constants fixed after `stellar network settings` on testnet)

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
  stays smaller. If footprint-only extension proves impractical we add the function back.
- Restore: the relay's simulation fills the restore set, so the normal path needs no special code. The backend only handles
  the case where simulation says a restore is needed and the transaction would be too large, by submitting `RestoreFootprint`
  first. After any restore the keeper re-extends.
- A cota whose entries nobody touches or extends for longer than the maximum TTL is archived, not lost; the first transaction
  that touches it pays the restore. Accepted.

## Functions

| # | Function | Auth | Notes |
|---|---|---|---|
| 1 | `__constructor(admin, kyc_authority, token)` | - | validates token has 6 decimals |
| 2 | `approve_kyc(wallet)` | `kyc_authority` | sets `Kyc`; error if already approved |
| 3 | `create_group(name, uri, quota, max_members, period, admin_fee_bps)` | `admin` | fee <= 10%, name <= 32 bytes, uri <= 200 bytes, quota > 0, period > 0 |
| 4 | `join_group(group_id, member)` | `member` | needs `Kyc(member)`; index = members_joined; not full; mints the NFT to `member` |
| 5 | `pay_quota(group_id, index)` | current NFT owner | status Open; one payment per round; pulls `quota` from the owner with `token.transfer`; verifies the contract's balance rose by exactly `quota` (rejects fee-on-transfer tokens) |
| 6 | `request_draw(group_id, committer, commitment)` | `committer` | after `next_draw_ts`; >= 1 eligible; status -> DrawPending; stores commitment + `commit_ledger = sequence + COMMIT_DELAY`. Re-callable once `sequence > commit_ledger + COMMIT_EXPIRY` |
| 7 | `settle_draw(group_id, secret)` | the stored `committer` | `sha256(secret) == commitment`, `sequence > commit_ledger`; picks winner, writes `Prize`, round += 1, clears paid_bitmap, `next_draw_ts = now + period` |
| 8 | `claim_prize(group_id, index)` | current NFT owner | cota must have won and not claimed; any round, any time; pays `gross - fee` to owner and `fee` to admin; once only |
| - | views | - | `get_group`, `get_prize`, `cota_owners(group_id)` (bulk), `is_kyc`, `group_count`, `config`, plus the OZ NFT views |

NFT transfers go through the OZ `transfer`; the Kotizi contract requires the **recipient** to have `Kyc` (as `KotiziMembership`
does). No burn exposed (a burned cota could never pay or claim).

Events (`env.events().publish`): `kyc_approved`, `group_created`, `member_joined`, `quota_paid`, `draw_requested`,
`draw_settled`, `prize_claimed`. Note Soroban RPC keeps events only a limited window, so the app never depends on them for
state; reads come from contract views.

## Randomness  **[DEVIATION from KICKOFF "Randomness"]**

Constraint: no ledger hash readable in a contract; `env.prng()` is explicitly not for low-risk-tolerance use; nothing in the
protocol gives a VRF we can rely on.

Proposal: **commit-reveal with a keeper secret, mixed with the contract PRNG at settle**.

- `request_draw`: the committer (normally the backend keeper) submits `commitment = sha256(secret)`. The set of eligible
  cotas is frozen at that moment (`pay_quota` requires status Open), so the keeper cannot pick a winner *after* seeing
  something it didn't know when committing... except it knows the eligible set, so see the weakness below.
- `settle_draw`: reveals `secret`. `random = sha256(secret || group_id || round || prng_u64)` where `prng_u64` is drawn from
  `env.prng()` during the settle transaction, which the keeper does not know at commit time. Winner picked from `random`.
- Weaknesses, accepted for a **testnet demo, not for real money** (carry `TODO(vrf)` in the code):
  - Withholding: the committer knows `secret` and can simulate `settle_draw` first and refuse to submit if it dislikes the
    result; the cost is waiting out `COMMIT_EXPIRY` and re-committing, so the bias is bounded by retries, not free.
  - If the keeper alone chose its secret with the `prng` term removed it would control the outcome completely; the `prng`
    term is what prevents that. How strongly `env.prng()` can be steered by a transaction submitter is **unverified** and I
    will test it in the sandbox before relying on it. If it can be steered trivially the draw degrades to "trusted keeper".
  - Only the committer can settle (no one else knows the secret). A silent keeper stalls a group until someone else re-commits
    after expiry. Anyone may re-commit then, so the admin can always run a backup keeper.
- Out of scope: chasing a VRF. `request_draw`/`settle_draw` are the stable seam; swapping the internals later is local to one
  module (`randomness.rs`), the same as in the reference repo.

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
`request_draw`/`settle_draw` are not relayed: the keeper sends them with its committer key (own key, separate from the sponsor
key). `approve_kyc` and faucet mints use their own keys, as in the reference (three-plus separate server keys, files now).

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
namespacing. Keeper: poll due groups, `request_draw` with a fresh secret kept in memory/DB until revealed, `settle_draw` when
`sequence > commit_ledger`; re-commit after expiry. The keeper's pending secret must survive a restart (stored encrypted-at-rest
or in the DB for the demo; flagged in the risk notes).

## Frontend (task 6)

`stellar contract bindings typescript` for the typed client; `src/chain/stellar/client.ts` implements the existing
`KotiziClient`. Raw-sign flow in `privy-session.tsx` (currently `signer: null`). `src/chain/stellar/generated/` is gitignored
until frozen. The mock keeps working in the meantime.

## Security checklist (every function)

`require_auth` on every authority (and the *right* address: NFT owner for pay/claim, committer for settle); checked arithmetic on
every `i128`/`u32`; Soroban forbids contract re-entry by default, and state is still written before the token transfer; token
calls go only to the configured token address; pay-in balance delta verified; no double pay/claim/settle; draw cannot be
settled before `commit_ledger` or without the matching secret, nor replayed (winner derivation binds group and round);
`vault >= unclaimed_total + pool` before recording a prize; recipient-KYC on NFT transfer; TTL extended on every touched entry;
negative tests for each.

Known and accepted: no KYC revocation; a winner who never claims only strands their own prize; the randomness caveats above.

## Task schedule

| Task | Output | Done when |
|---|---|---|
| 3 | KYC, `create_group`, `join_group` (+NFT), `pay_quota`, test token | tests incl. no-KYC, double pay, full group, wrong token, wrong signer. Verify the OZ NFT API first (decision 6). |
| 4 | `request_draw`, `settle_draw`, `claim_prize` | tests: early draw, none eligible, early/replayed settle, wrong secret, non-committer, non-winner/double claim, full completion. Sandbox test of `prng` steerability. |
| 5 | backend wired; account activation; prepare/relay; keeper | one real sponsored join + pay on testnet (asks you before deploy/funding) |
| 6 | bindings, client, Privy raw-sign | real login + join from the browser |
| 7 | seed script | test token, N keypairs, KYC, group, join + pay all (asks before running on testnet) |

## Open questions for you

1. Approve deviations 1, 2, 4, 6 (randomness, auth-entry gasless, own token, single contract)?
2. Meridian deadline, to turn the table into dates?
3. OK to create the Privy test app / do the real-login check myself, or will you do it (I won't touch your Privy secrets)?
