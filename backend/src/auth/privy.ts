import { PrivyClient } from '@privy-io/node';
import { AuthError, type Authenticator, type AuthUser } from './index.js';

const WALLET_CACHE_MS = 30_000;

type LinkedAccount = { type: string; address?: string; chain_type?: string };

/**
 * Stellar wallets among a Privy user's linked accounts (embedded and external).
 * UNVERIFIED: that Privy lists Stellar wallets with `chain_type: 'stellar'` is an assumption to retire
 * with one real login (KICKOFF_PROMPT.md, "Auth/wallets").
 */
export function stellarWalletsOf(linked: ReadonlyArray<LinkedAccount>): string[] {
  return linked.flatMap((a) => (a.type === 'wallet' && a.chain_type === 'stellar' && a.address ? [a.address] : []));
}

/** The Privy calls we need; a seam so the caching can be tested without the network. */
export interface PrivyDirectory {
  /** Verifies an access token and returns the Privy user id. Throws if invalid. */
  verify(token: string): Promise<string>;
  /** The user's linked Stellar wallets. */
  wallets(userId: string): Promise<string[]>;
}

export function privyDirectory(appId: string, appSecret: string): PrivyDirectory {
  const privy = new PrivyClient({ appId, appSecret });
  return {
    verify: async (token) => (await privy.utils().auth().verifyAccessToken(token)).user_id,
    wallets: async (userId) => stellarWalletsOf((await privy.users()._get(userId)).linked_accounts as ReadonlyArray<LinkedAccount>),
  };
}

/** Verifies Privy access tokens and resolves the user's linked Stellar wallets. */
export class PrivyAuthenticator implements Authenticator {
  private readonly cache = new Map<string, { at: number; user: AuthUser }>();

  constructor(
    private readonly directory: PrivyDirectory,
    private readonly now: () => number = Date.now,
  ) {}

  async authenticate(token: string): Promise<AuthUser> {
    let userId: string;
    try {
      userId = await this.directory.verify(token);
    } catch {
      throw new AuthError('Invalid or expired access token');
    }
    const hit = this.cache.get(userId);
    if (hit && this.now() - hit.at < WALLET_CACHE_MS) return hit.user;

    const wallets = await this.directory.wallets(userId);
    const user: AuthUser = { userId, wallets };
    // A new user's embedded wallet is created a moment after login. Never cache "no wallet yet",
    // or the frontend would see an empty list for the whole cache window.
    if (wallets.length > 0) this.cache.set(userId, { at: this.now(), user });
    return user;
  }
}
