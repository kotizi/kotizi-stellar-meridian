import { describe, expect, test } from "bun:test";

import { stellarExpertUrl } from "./network";

describe("stellar.expert links", () => {
  test("open a transaction, a contract or an account on testnet", () => {
    const base = "https://stellar.expert/explorer/testnet";
    expect(stellarExpertUrl("tx", "ab12")).toBe(`${base}/tx/ab12`);
    expect(stellarExpertUrl("address", "CDLG5PWR")).toBe(`${base}/contract/CDLG5PWR`);
    expect(stellarExpertUrl("address", "GBG2Y3PQ")).toBe(`${base}/account/GBG2Y3PQ`);
  });
});
