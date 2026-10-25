# kotizi-stellar-meridian

Kotizi on Stellar/Soroban, for the Stellar Meridian hackathon. Single network: no multichain
abstraction, no router, no per-network config — this repo only ever talks to Stellar.

`frontend/` and `backend/` were seeded from `kotizi/colosseum-kotizi-monorepo` (the Solana + EVM
monorepo) as a starting point to reuse, not as a vendored copy to keep in sync:

- `frontend/`: extracted from that repo's `develop` branch (the current frontend, post-refactor:
  `kz/` is the design system, product pieces live under `features/`).
- `backend/`: extracted from that repo's `main` branch (Fastify + Privy + Drizzle + gasless relay +
  keeper), still carrying its Solana- and EVM-specific code — that gets stripped down to one Stellar
  module per `KICKOFF_PROMPT.md`.

There is no `programs/` or `evm/` here on purpose: the Anchor program and the Solidity contracts are
not being ported line-by-line. See `KICKOFF_PROMPT.md` for what to build instead and why.

The original monorepo is the read-only reference for product semantics (accounts, instructions,
state machine, security checklist) whenever this repo's own `PLAN.md` doesn't already cover it.
