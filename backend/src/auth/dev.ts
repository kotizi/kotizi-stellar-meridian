import { AuthError, type Authenticator, type AuthUser } from './index.js';

/**
 * Local development only (refused when NODE_ENV=production). The token is `dev:<wallet>[,<wallet>...]`
 * and is trusted as is, so the frontend can be built before a Privy app exists.
 */
export class DevAuthenticator implements Authenticator {
  async authenticate(token: string): Promise<AuthUser> {
    if (!token.startsWith('dev:')) throw new AuthError('Dev tokens look like "dev:<wallet>"');
    const wallets = token.slice(4).split(',').filter(Boolean);
    if (wallets.length === 0) throw new AuthError('Dev token has no wallet');
    return { userId: `dev-${wallets[0]}`, wallets };
  }
}
