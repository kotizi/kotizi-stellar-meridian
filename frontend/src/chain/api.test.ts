import { describe, expect, test } from "bun:test";

import { BackendError, createBackendApi } from "./api";

import { z } from "zod";

/** A fetch that answers each call with the next response, and counts the calls. */
function fakeFetch(responses: { status: number; body: unknown }[]) {
  let calls = 0;
  const fetch = (async () => {
    const { status, body } = responses[Math.min(calls++, responses.length - 1)];
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls: () => calls };
}

const noWallet = { status: 400, body: { code: "no_wallet", message: "The user has no Solana wallet yet" } };
const tooMany = { status: 429, body: { code: "FST_ERR_RATE_LIMIT", message: "Rate limit exceeded, retry in 1 minute" } };
const api = (fetch: typeof globalThis.fetch, slept: number[] = []) =>
  createBackendApi({ baseUrl: "http://api", getAccessToken: async () => "token", fetch, sleep: async (ms) => void slept.push(ms) });

describe("createBackendApi", () => {
  test("retries a wallet the backend doesn't know yet until it does", async () => {
    const { fetch, calls } = fakeFetch([noWallet, noWallet, { status: 200, body: { status: "approved" } }]);
    const slept: number[] = [];
    expect(await api(fetch, slept).request("/v1/kyc", z.object({ status: z.string() }), { method: "POST", auth: true })).toEqual({ status: "approved" });
    expect(calls()).toBe(3);
    expect(slept).toEqual([3000, 3000]);
  });

  test("gives up once the backend's wallet cache would have caught up", async () => {
    const { fetch, calls } = fakeFetch([noWallet]);
    await expect(api(fetch).request("/v1/kyc", z.unknown(), { method: "POST", auth: true })).rejects.toBeInstanceOf(BackendError);
    expect(calls()).toBe(12); // the first try, then one every 3 s for 35 s
  });

  test("doesn't retry other errors or requests without a session", async () => {
    const failed = fakeFetch([{ status: 422, body: { code: "transaction_failed", message: "NotKyc" } }]);
    await expect(api(failed.fetch).request("/v1/tx/relay", z.unknown(), { method: "POST", auth: true })).rejects.toThrow("NotKyc");
    expect(failed.calls()).toBe(1);
    const read = fakeFetch([noWallet]);
    await expect(api(read.fetch).request("/v1/groups", z.unknown())).rejects.toThrow();
    expect(read.calls()).toBe(1);
  });

  test("waits and asks again when a read is rate-limited", async () => {
    const { fetch, calls } = fakeFetch([tooMany, tooMany, { status: 200, body: { groups: [] } }]);
    const slept: number[] = [];
    expect(await api(fetch, slept).request("/v1/groups", z.object({ groups: z.array(z.unknown()) }))).toEqual({ groups: [] });
    expect(calls()).toBe(3);
    expect(slept).toEqual([2000, 4000]);
  });

  test("gives up on a rate-limited read after three waits, and never repeats a write", async () => {
    const read = fakeFetch([tooMany]);
    const slept: number[] = [];
    await expect(api(read.fetch, slept).request("/v1/groups", z.unknown())).rejects.toMatchObject({ status: 429 });
    expect(read.calls()).toBe(4);
    expect(slept).toEqual([2000, 4000, 8000]);
    const write = fakeFetch([tooMany]);
    await expect(api(write.fetch).request("/v1/tx/relay", z.unknown(), { method: "POST", auth: true })).rejects.toMatchObject({ status: 429 });
    expect(write.calls()).toBe(1);
  });

  test("rejects an answer that doesn't match the schema", async () => {
    const { fetch } = fakeFetch([{ status: 200, body: { admin: 42 } }]);
    const error = await api(fetch).request("/v1/config", z.object({ admin: z.string() })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendError);
    expect(error).toMatchObject({ status: 502, code: "invalid_response" });
  });
});
