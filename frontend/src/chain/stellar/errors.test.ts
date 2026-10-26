import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BackendError } from "../api";
import { KotiziError } from "../errors";
import { CONTRACT_ERROR_CODES, CONTRACT_ERRORS, contractErrorFromHost, toStellarError, UNMAPPED_CONTRACT_ERRORS } from "./errors";

const code = (error: unknown) => (error instanceof KotiziError ? error.code : null);

describe("contract errors", () => {
  test("every error in contract/kotizi/src/errors.rs is mapped or knowingly left plain", () => {
    const source = readFileSync(join(import.meta.dir, "../../../../contract/kotizi/src/errors.rs"), "utf8");
    const names = [...source.matchAll(/^\s+(\w+) = \d+,$/gm)].map(([, name]) => name);
    expect(names.length).toBeGreaterThan(20);
    const known = new Set([...Object.keys(CONTRACT_ERRORS), ...UNMAPPED_CONTRACT_ERRORS]);
    expect(names.filter((name) => !known.has(name))).toEqual([]);
    // And nothing here names an error the contract doesn't have.
    expect([...known].filter((name) => !names.includes(name))).toEqual([]);
  });

  test("the error numbers match errors.rs", () => {
    const source = readFileSync(join(import.meta.dir, "../../../../contract/kotizi/src/errors.rs"), "utf8");
    const declared = Object.fromEntries([...source.matchAll(/^\s+(\w+) = (\d+),$/gm)].map(([, name, n]) => [Number(n), name]));
    expect(CONTRACT_ERROR_CODES).toEqual(declared);
  });

  test("a raw host error from the RPC (the admin's own transaction) becomes the app's code", () => {
    expect(contractErrorFromHost("HostError: Error(Contract, #8)\n...")).toBe("FeeTooHigh");
    expect(contractErrorFromHost("Error(Contract, #27)")).toBe("TokenNotSupported");
    expect(contractErrorFromHost("Error(Contract, #17)")).toBeNull();
    expect(contractErrorFromHost("Error(Auth, InvalidAction)")).toBeNull();
  });

  test("a contract error from the relay or a draw step becomes the app's code", () => {
    expect(code(toStellarError(new BackendError(422, "contract_error", "NotKyc")))).toBe("KycRequired");
    expect(code(toStellarError(new BackendError(422, "contract_error", "AlreadyPaid")))).toBe("AlreadyPaid");
    expect(code(toStellarError(new BackendError(422, "draw_failed", "InvalidBeacon")))).toBe("InvalidBeacon");
  });

  test("an error the UI has no words for stays a failed transaction", () => {
    expect(code(toStellarError(new BackendError(422, "contract_error", "MathOverflow")))).toBe("TransactionFailed");
  });
});

describe("backend codes", () => {
  test("the demo token's insufficient balance", () => {
    const e = new BackendError(422, "transaction_failed", "HostError: Error(Contract, #100) ...");
    expect(code(toStellarError(e))).toBe("InsufficientFunds");
  });

  test("relay refusals the user can act on", () => {
    expect(code(toStellarError(new BackendError(409, "account_not_active", "")))).toBe("KycRequired");
    expect(code(toStellarError(new BackendError(409, "authorization_expired", "")))).toBe("TransactionExpired");
    expect(code(toStellarError(new BackendError(403, "not_user_wallet", "")))).toBe("NotAssetOwner");
    expect(code(toStellarError(new BackendError(422, "missing_trustline", "")))).toBe("TrustlineRequired");
  });

  test("the shared mapping: session, budget, faucet, outages", () => {
    expect(code(toStellarError(new BackendError(401, "unauthorized", "")))).toBe("SessionExpired");
    expect(code(toStellarError(new BackendError(503, "sponsor_funds", "")))).toBe("SponsorUnavailable");
    expect(code(toStellarError(new BackendError(429, "faucet_limit", "")))).toBe("FaucetLimit");
    expect(code(toStellarError(new BackendError(502, "invalid_response", "")))).toBe("ServiceUnavailable");
  });

  test("the wallet and the network", () => {
    expect(code(toStellarError(Object.assign(new Error("User rejected"), { code: 4001 })))).toBe("UserRejected");
    expect(code(toStellarError(new TypeError("fetch failed")))).toBe("NetworkError");
    const other = new Error("something else");
    expect(toStellarError(other)).toBe(other);
  });
});
