"use client";

import { useChainQuery } from "./hooks";
import { useKotiziClient } from "./provider";

/**
 * The client's test helpers (test balance, failure simulation…), only once the network is known to
 * be a test one: never on mainnet, and hidden while that's unknown (loading, failed read).
 */
export function useTestHelpers() {
  const client = useKotiziClient();
  const network = useChainQuery(["isTestNetwork"], (c) => c.isTestNetwork(), { pollMs: 0 });
  return network.data === true ? client.testing : undefined;
}
