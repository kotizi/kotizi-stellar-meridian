import { beforeEach, describe, expect, test } from "bun:test";

import { clearIdentityCheck, completeIdentityCheck, markLogin, requiresIdentityCheck } from "./identity-check";

// The store keeps its state in sessionStorage; bun has none, so a Map stands in for it.
const storage = new Map<string, string>();
Object.assign(globalThis, {
  sessionStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  },
});
const pending = () => JSON.parse(storage.get("kotizi:identity-check") ?? "{}").pending as boolean | undefined;

describe("requiresIdentityCheck", () => {
  test("a new account goes through the form even if its wallet already has a record", () => {
    expect(requiresIdentityCheck({ newAccountPending: true, kycApproved: true })).toBe(true);
    expect(requiresIdentityCheck({ newAccountPending: true, kycApproved: undefined })).toBe(true);
  });

  test("an existing account only when its wallet has no identity record", () => {
    expect(requiresIdentityCheck({ newAccountPending: false, kycApproved: false })).toBe(true);
    expect(requiresIdentityCheck({ newAccountPending: false, kycApproved: true })).toBe(false);
  });

  test("verified in this tab: a read that still misses the record doesn't send it back", () => {
    expect(requiresIdentityCheck({ newAccountPending: false, verifiedHere: true, kycApproved: false })).toBe(false);
  });

  test("unknown while the identity record hasn't been read", () => {
    expect(requiresIdentityCheck({ newAccountPending: false, kycApproved: undefined })).toBeUndefined();
  });
});

describe("markLogin", () => {
  beforeEach(() => clearIdentityCheck());

  test("Privy reporting the same login again doesn't undo a finished verification", () => {
    markLogin({ accountId: "did:privy:a", isNewAccount: true });
    expect(pending()).toBe(true);
    completeIdentityCheck();
    // e.g. a Privy modal closing after the form: same account, isNewUser still true
    markLogin({ accountId: "did:privy:a", isNewAccount: true });
    expect(pending()).toBe(false);
    expect(JSON.parse(storage.get("kotizi:identity-check")!).verified).toBe(true);
  });

  test("another account, or the same one after signing out, counts as a new login", () => {
    markLogin({ accountId: "did:privy:a", isNewAccount: true });
    completeIdentityCheck();
    markLogin({ accountId: "did:privy:b", isNewAccount: true });
    expect(pending()).toBe(true);
    clearIdentityCheck();
    markLogin({ accountId: "did:privy:a", isNewAccount: true });
    expect(pending()).toBe(true);
  });
});
