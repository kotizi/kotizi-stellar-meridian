import type { FastifyInstance } from 'fastify';
import { and, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import type { Deps } from '../deps.js';
import { schema } from '../db/index.js';
import { StellarTxError } from '../stellar/errors.js';
import { addr, i128, invokeFunc } from '../stellar/invoke.js';
import { withAccountLock } from '../stellar/lock.js';
import { HttpError, pickWallet, requireAuth } from './common.js';

const body = z.object({ wallet: z.string().optional() }).default({});
const DAY_MS = 24 * 60 * 60 * 1000;

/** Demo-only onboarding: account activation, auto KYC and a test-USDC faucet. All need server-side keys. */
export function onboardingRoutes(app: FastifyInstance, deps: Deps) {
  const { db, chain, config } = deps;

  /** A wallet must exist on the ledger before it can authorize anything: the sponsor creates it. */
  async function ensureActive(wallet: string): Promise<string | null> {
    if (await chain.accountExists(wallet)) return null;
    return withAccountLock(deps.sponsor.publicKey(), () =>
      chain.createAccount(deps.sponsor, wallet, config.ACCOUNT_ACTIVATION_XLM),
    );
  }

  /** `signer` is the transaction source, so its signature also authorizes the call. */
  async function invokeAs(signer: import('@stellar/stellar-sdk').Keypair, contractId: string, fn: string, args: Parameters<typeof invokeFunc>[2]) {
    return withAccountLock(signer.publicKey(), async () => {
      const { transaction } = await chain.invokeTx(signer.publicKey(), invokeFunc(contractId, fn, args));
      transaction.sign(signer);
      return chain.send(transaction);
    });
  }

  const fail = (e: unknown): never => {
    if (e instanceof StellarTxError) throw new HttpError(422, e.contractError ? 'contract_error' : 'transaction_failed', e.contractError ?? e.message);
    throw e;
  };

  app.post('/v1/kyc', { preHandler: requireAuth(deps) }, async (req) => {
    const wallet = pickWallet(req, body.parse(req.body).wallet);
    const activation = await ensureActive(wallet).catch(fail);
    if (await chain.isKyc(wallet)) return { wallet, status: 'approved', alreadyApproved: true, activationTx: activation };
    if (config.KYC_MODE !== 'auto' || !deps.kycSigner) {
      throw new HttpError(501, 'kyc_unavailable', 'Automatic KYC is disabled; connect a KYC provider');
    }
    try {
      const txHash = await invokeAs(deps.kycSigner, chain.contractId, 'approve_kyc', [addr(wallet)]);
      await db.insert(schema.kycApprovals).values({ wallet, userId: req.user.userId, txHash }).onConflictDoNothing();
      return { wallet, status: 'approved', txHash, activationTx: activation };
    } catch (e) {
      return fail(e);
    }
  });

  app.post('/v1/faucet', { preHandler: requireAuth(deps) }, async (req) => {
    if (!deps.mintSigner) throw new HttpError(501, 'faucet_disabled', 'The faucet is disabled');
    const wallet = pickWallet(req, body.parse(req.body).wallet);

    const since = new Date(Date.now() - DAY_MS);
    const recent = await db
      .select({ id: schema.faucetClaims.id })
      .from(schema.faucetClaims)
      .where(and(eq(schema.faucetClaims.wallet, wallet), gte(schema.faucetClaims.createdAt, since)))
      .limit(1);
    if (recent.length > 0) throw new HttpError(429, 'faucet_limit', 'One faucet claim per wallet per day');

    try {
      // The amount is in whole tokens; the token says how many base units that is.
      const decimals = (await chain.tokens()).find((t) => t.token === config.FAUCET_TOKEN)?.decimals;
      if (decimals === undefined) throw new HttpError(503, 'faucet_misconfigured', 'FAUCET_TOKEN is not a token enabled in the contract');
      const amount = BigInt(Math.round(config.FAUCET_AMOUNT_USDC * 10 ** decimals));
      await ensureActive(wallet);
      const txHash = await invokeAs(deps.mintSigner, config.FAUCET_TOKEN!, 'mint', [addr(wallet), i128(amount)]);
      await db.insert(schema.faucetClaims).values({ wallet, userId: req.user.userId, amount: Number(amount), txHash });
      return { wallet, amount: amount.toString(), txHash };
    } catch (e) {
      return fail(e);
    }
  });
}
