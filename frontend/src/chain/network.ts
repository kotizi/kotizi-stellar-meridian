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

// TODO(stellar): stellar.expert paths (`/tx/<hash>`, `/contract/<id>`, `/account/<id>`) once the client exists.
export const network: Network =
  env.chainClient === "mock"
    ? { name: "Simulated (demo)", explorerUrl: null }
    : {
        name: "Stellar testnet",
        explorerUrl: (kind, value) =>
          `https://stellar.expert/explorer/testnet/${kind === "tx" ? "tx" : "contract"}/${value}`,
      };
