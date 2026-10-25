// The account's Stellar wallet on Privy. Stellar is one of Privy's "extended chains": there is no
// `createOnLogin` for it, so the app creates the embedded wallet itself after login, and it signs a
// raw 32-byte hash (the payload of a Soroban authorization entry) with ed25519.

/** The parts of a Privy user this module reads. */
export type PrivyUserLike = {
  linkedAccounts: readonly { type: string; chainType?: string; address?: string; walletClientType?: string }[];
};

/** Privy's own embedded wallets (`privy-v2` is the client of the extended chains). */
const EMBEDDED_CLIENTS = new Set(["privy", "privy-v2"]);

function stellarWallets(user: PrivyUserLike) {
  return user.linkedAccounts.flatMap((a) =>
    a.type === "wallet" && a.chainType === "stellar" && a.address
      ? [{ address: a.address, embedded: EMBEDDED_CLIENTS.has(a.walletClientType ?? "") }]
      : [],
  );
}

/** The account's Stellar address: its embedded wallet, else any linked one; null without any. */
export function stellarAddressOf(user: PrivyUserLike): string | null {
  const wallets = stellarWallets(user);
  return (wallets.find((w) => w.embedded) ?? wallets[0])?.address ?? null;
}

/** Whether the account still has no Stellar wallet, so the app must create its embedded one. */
export function needsStellarWallet(user: PrivyUserLike): boolean {
  return stellarWallets(user).length === 0;
}

/** `0x`-prefixed hex, as Privy's `signRawHash` takes the hash. */
export function toHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** The 64-byte ed25519 signature Privy answers as hex (with or without `0x`). Anything else throws. */
export function signatureBytes(hex: string): Uint8Array {
  const digits = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{128}$/.test(digits)) throw new Error("The wallet answered something that isn't an ed25519 signature");
  return Uint8Array.from(digits.match(/../g)!, (pair) => parseInt(pair, 16));
}
