import { describe, expect, test } from "bun:test";

import { needsStellarWallet, signatureBytes, stellarAddressOf, toHex } from "./stellar-wallet";

const wallet = (chainType: string, address: string, walletClientType?: string) => ({ type: "wallet", chainType, address, walletClientType });

describe("the account's Stellar wallet", () => {
  test("prefers the embedded wallet, then any linked one", () => {
    const user = { linkedAccounts: [wallet("stellar", "GEXTERNAL", "freighter"), wallet("stellar", "GEMBEDDED", "privy-v2")] };
    expect(stellarAddressOf(user)).toBe("GEMBEDDED");
    expect(stellarAddressOf({ linkedAccounts: [wallet("stellar", "GEXTERNAL", "freighter")] })).toBe("GEXTERNAL");
  });

  test("ignores other chains and other account types", () => {
    const user = { linkedAccounts: [{ type: "email" }, wallet("ethereum", "0xabc", "privy"), wallet("solana", "So1", "privy")] };
    expect(stellarAddressOf(user)).toBeNull();
    expect(needsStellarWallet(user)).toBe(true);
  });

  test("an account with a Stellar wallet needs none", () => {
    expect(needsStellarWallet({ linkedAccounts: [wallet("stellar", "GEMBEDDED", "privy-v2")] })).toBe(false);
    expect(needsStellarWallet({ linkedAccounts: [] })).toBe(true);
  });
});

describe("raw hash signing", () => {
  test("sends the hash as 0x hex", () => {
    expect(toHex(Uint8Array.from([0, 1, 254, 255]))).toBe("0x0001feff");
  });

  test("reads back a 64-byte signature, with or without 0x", () => {
    const hex = "ab".repeat(64);
    expect(signatureBytes(`0x${hex}`)).toEqual(new Uint8Array(64).fill(0xab));
    expect(signatureBytes(hex)).toHaveLength(64);
  });

  test("refuses anything that isn't 64 bytes of hex", () => {
    expect(() => signatureBytes("0x" + "ab".repeat(65))).toThrow();
    expect(() => signatureBytes("0x" + "zz".repeat(64))).toThrow();
    expect(() => signatureBytes("")).toThrow();
  });
});
