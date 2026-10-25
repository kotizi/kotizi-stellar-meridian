import { env } from "@/config/env";

/**
 * The one network this app serves: Stellar testnet (or the in-browser mock while no contract is
 * deployed). There is no network id and no choice; this only names it and links its explorer.
 */
export interface Network {
  /** Shown in the on-chain details panel. */
  name: string;
  /** Explorer link for a transaction or an address; null where there is no explorer (the mock). */
  explorerUrl: ((kind: "tx" | "address", value: string) => string) | null;
}

/** stellar.expert's page for a transaction, a contract (`C…`) or an account (`G…`). */
export function stellarExpertUrl(kind: "tx" | "address", value: string): string {
  const path = kind === "tx" ? "tx" : value.startsWith("C") ? "contract" : "account";
  return `https://stellar.expert/explorer/testnet/${path}/${value}`;
}

export const network: Network =
  env.chainClient === "mock"
    ? { name: "Simulated (demo)", explorerUrl: null }
    : { name: "Stellar testnet", explorerUrl: stellarExpertUrl };
