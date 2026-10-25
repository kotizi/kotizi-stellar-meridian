export type AuthUser = {
  /** Stable id of the user at the identity provider (Privy DID). */
  userId: string;
  /** Stellar wallets linked to the user (embedded and external), G... addresses. */
  wallets: string[];
};

export class AuthError extends Error {}

export interface Authenticator {
  /** Verifies a bearer token and returns who it belongs to. Throws AuthError. */
  authenticate(token: string): Promise<AuthUser>;
}
