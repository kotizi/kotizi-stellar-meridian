# Kotizi backend (Stellar)

Fastify + Privy auth + Drizzle (Postgres, or embedded PGlite when `DATABASE_URL` is unset).

Currently a **stripped skeleton**: the Solana/EVM code from the reference repo was removed and the
Stellar wiring (config, chain reads, fee-bump relay, keeper, routes) lands in task 5 of
`KICKOFF_PROMPT.md`. Only `/healthz` is served today.

```bash
cp .env.example .env   # AUTH_MODE=dev for local work
npm install
npm run typecheck && npm test
npm run dev
```
