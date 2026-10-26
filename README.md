# Kotizi on Stellar

Kotizi is a tokenized *consórcio* (a rotating savings circle, ROSCA) on Stellar/Soroban, built for the Stellar Meridian
hackathon. Members join a group, pay a fixed quota in a token every round, and each round one member who has paid and
has not yet won is drawn and claims the pool. Each seat in a group is a transferable NFT (a **cota**): whoever owns the
NFT pays and claims.

**Testnet only. Nothing has been audited.** The repo only ever talks to Stellar.

## How it works

1. **Join.** A KYC authority approves the wallet on-chain. The member joins a group and receives a SEP-50 NFT for the
   seat; the NFT can only move between KYC-approved wallets.
2. **Pay.** Each round every member pays the quota in the token the group was created with (an admin-allowlisted token:
   demo tokens, Circle testnet USDC). The contract holds the funds.
3. **Draw.** Once a round is due, a draw is requested. The contract fixes a future round of the public
   [drand](https://drand.love) quicknet beacon and, when that round exists, verifies its BLS12-381 signature itself
   (pairing check on-chain). The winner comes from `sha256(signature ‖ group_id)` among the cotas that paid and have not
   won, so nobody can predict or influence it, the keeper included.
4. **Claim.** The owner of the winning cota calls `claim_prize` and receives the pool minus the organizer's fee. This
   repeats until every cota has won.

Members never pay gas or handle a seed phrase: they sign in with email (Privy embedded wallet) and sign only a Soroban
authorization payload, while the backend is the transaction source and pays the fees.

## Repository

| Folder | What |
|---|---|
| `contract/kotizi` | The Soroban contract (Rust, `soroban-sdk` 28, OpenZeppelin `stellar-tokens` NFT). Typed errors, 28 tests. |
| `contract/test-usdc` | A mintable SEP-41 demo token for the faucet and tests. |
| `backend/` | Fastify + Privy + Drizzle API: gasless relay (`prepare` / `relay`), account activation, auto KYC, test faucet, and the draw keeper that also keeps contract storage alive. 81 tests. See `backend/README.md`. |
| `frontend/` | Next.js app (Privy, `@stellar/stellar-sdk`), with a mock mode that needs no backend. See `frontend/README.md`. Built by the frontend team. |

Documents:

- `docs.md`: how to use the contracts directly with the `stellar` CLI, function reference, errors, events, the draw,
  tokens, storage lifetime, and known limits.
- `PLAN.md`: the design, the decisions and the accepted risks.
- `DEPLOYMENTS.md`: current testnet addresses, accounts and demo groups.

## Quick start

```bash
# contract
cd contract && cargo test && stellar contract build

# backend (offline tests use an in-memory chain)
cd backend && cp .env.example .env   # AUTH_MODE=dev for local work; set CONTRACT_ID and the role keys
npm install --legacy-peer-deps && npm test && npm run dev

# frontend
cd frontend && bun install && bun run dev
```

Role keys (`SPONSOR`, `KEEPER`, `KYC`, `MINT`) come from files in `keypairs/` (gitignored) or from `*_SECRET`
environment variables, for hosts such as Railway. The backend deploys from the `backend` directory. See
`backend/README.md` for every variable.

## Design choices worth knowing

- **Randomness is verified on-chain.** Soroban has no ledger-hash randomness, and `env.prng()` is not suitable for
  prizes, so the draw uses drand and checks the signature in the contract. The keeper holds no secret; settling a draw
  is open to anyone.
- **Several tokens.** Each group collects one token from an admin allowlist, with its own decimals. Real Stellar assets
  (USDC, USDT0) need a trustline: `/v1/me` reports who lacks one, and the relay answers `missing_trustline`.
- **Storage lifetime.** Soroban entries expire. The contract extends its own, and the keeper extends the NFT owner
  entries, which the NFT library keeps for only ~30 days.
- **Not upgradeable.** A contract change means a redeploy (about 51 XLM) and a new `CONTRACT_ID`.

## Known limits

- A winner can stop paying after winning: there is no collateral or default handling (out of scope, see `PLAN.md`).
- The backend reports a missing trustline but does not create it.
- No emergency pause, no KYC revocation, and no audit.
- `request_draw` is open to anyone on `main`. A keeper-only version lives on the branch `feat/keeper-only-draw`; it
  needs a redeploy before it can be merged.

## Origin

`frontend/` and `backend/` were seeded from the Solana + EVM monorepo `colosseum-kotizi-monorepo` as a starting point,
not a vendored copy. The Anchor program and the Solidity contracts were not ported line by line: the Soroban contract
was written from the product semantics. `KICKOFF_PROMPT.md` (local, not tracked) holds the original brief.
