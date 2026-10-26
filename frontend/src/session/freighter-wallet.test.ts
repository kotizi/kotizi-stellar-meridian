import { describe, expect, test } from "bun:test";

import { isUserRejected, KotiziError } from "@/chain/errors";

import { connectFreighter, readFreighter, signWithFreighter, type FreighterApi } from "./freighter-wallet";

const TESTNET = "Test SDF Network ; September 2015";
const PUBNET = "Public Global Stellar Network ; September 2015";
const ADMIN = "GADMIN";
const XDR = "AAAA-unsigned";

/** Freighter's answer when the user declines a prompt (its `{ error }`, not a throw). */
const DECLINED = { code: -4, message: "The user rejected this request." };

/** A Freighter on testnet, allowed on this site, that signs whatever it's given. */
function fakeFreighter(overrides: Partial<FreighterApi> = {}) {
  const signed: { xdr: string; opts: unknown }[] = [];
  const wallet: FreighterApi = {
    isConnected: async () => ({ isConnected: true }),
    isAllowed: async () => ({ isAllowed: true }),
    getAddress: async () => ({ address: ADMIN }),
    requestAccess: async () => ({ address: ADMIN }),
    getNetworkDetails: async () => ({ network: "TESTNET", networkUrl: "https://horizon-testnet.stellar.org", networkPassphrase: TESTNET }),
    signTransaction: async (xdr, opts) => {
      signed.push({ xdr, opts });
      return { signedTxXdr: `${xdr}-signed`, signerAddress: ADMIN };
    },
    ...overrides,
  };
  return { wallet, signed };
}

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
};

describe("readFreighter (on mount, no prompt)", () => {
  test("an allowed site gets the address", async () => {
    const { wallet } = fakeFreighter();
    expect(await readFreighter(async () => wallet)).toEqual({ available: true, address: ADMIN });
  });

  test("a site not allowed yet: the extension is there, the address isn't read", async () => {
    let read = false;
    const { wallet } = fakeFreighter({
      isAllowed: async () => ({ isAllowed: false }),
      getAddress: async () => {
        read = true;
        return { address: ADMIN };
      },
    });
    expect(await readFreighter(async () => wallet)).toEqual({ available: true, address: null });
    expect(read).toBe(false);
  });

  test("no extension, or one that fails to load or answer, counts as missing", async () => {
    const { wallet } = fakeFreighter({ isConnected: async () => ({ isConnected: false }) });
    expect(await readFreighter(async () => wallet)).toEqual({ available: false, address: null });
    expect(await readFreighter(() => Promise.reject(new Error("chunk failed")))).toEqual({ available: false, address: null });
    const broken = fakeFreighter({ isConnected: () => Promise.reject(new Error("no answer")) }).wallet;
    expect(await readFreighter(async () => broken)).toEqual({ available: false, address: null });
  });

  test("an extension that fails after answering is there, without an address", async () => {
    const { wallet } = fakeFreighter({ getAddress: () => Promise.reject(new Error("locked")) });
    expect(await readFreighter(async () => wallet)).toEqual({ available: true, address: null });
  });

  test("an empty address (Freighter's answer with an error) is no address", async () => {
    const { wallet } = fakeFreighter({ getAddress: async () => ({ address: "", error: DECLINED }) });
    expect(await readFreighter(async () => wallet)).toEqual({ available: true, address: null });
  });
});

describe("connectFreighter", () => {
  test("resolves with the address the user shares", async () => {
    expect(await connectFreighter(fakeFreighter().wallet)).toBe(ADMIN);
  });

  test("a declined prompt reads as a cancelled confirmation", async () => {
    const { wallet } = fakeFreighter({ requestAccess: async () => ({ address: "", error: DECLINED }) });
    const error = await rejection(connectFreighter(wallet));
    expect(isUserRejected(error)).toBe(true);
  });
});

describe("signWithFreighter", () => {
  test("signs on the app's network, as the admin's address", async () => {
    const { wallet, signed } = fakeFreighter();
    expect(await signWithFreighter(wallet, { transactionXdr: XDR, networkPassphrase: TESTNET, address: ADMIN })).toBe(`${XDR}-signed`);
    expect(signed).toEqual([{ xdr: XDR, opts: { networkPassphrase: TESTNET, address: ADMIN } }]);
  });

  test("no address yet: Freighter signs with its current account", async () => {
    const { wallet, signed } = fakeFreighter();
    await signWithFreighter(wallet, { transactionXdr: XDR, networkPassphrase: TESTNET, address: null });
    expect(signed[0].opts).toEqual({ networkPassphrase: TESTNET, address: undefined });
  });

  test("Freighter on another network: WalletWrongNetwork, before any prompt", async () => {
    const { wallet, signed } = fakeFreighter({
      getNetworkDetails: async () => ({ network: "PUBLIC", networkUrl: "https://horizon.stellar.org", networkPassphrase: PUBNET }),
    });
    const error = await rejection(signWithFreighter(wallet, { transactionXdr: XDR, networkPassphrase: TESTNET, address: ADMIN }));
    expect(error).toBeInstanceOf(KotiziError);
    expect((error as KotiziError).code).toBe("WalletWrongNetwork");
    expect(signed).toHaveLength(0);
  });

  test("a declined signature reads as a cancelled confirmation", async () => {
    const { wallet } = fakeFreighter({ signTransaction: async () => ({ signedTxXdr: "", signerAddress: "", error: DECLINED }) });
    const error = await rejection(signWithFreighter(wallet, { transactionXdr: XDR, networkPassphrase: TESTNET, address: ADMIN }));
    expect(isUserRejected(error)).toBe(true);
  });

  test("an error Freighter reports while reading the network stops it too", async () => {
    const { wallet, signed } = fakeFreighter({
      getNetworkDetails: async () => ({ network: "", networkUrl: "", networkPassphrase: "", error: { code: -1, message: "Freighter is locked" } }),
    });
    const error = await rejection(signWithFreighter(wallet, { transactionXdr: XDR, networkPassphrase: TESTNET, address: ADMIN }));
    expect((error as Error).message).toBe("Freighter is locked");
    expect(signed).toHaveLength(0);
  });
});
