import { usdc } from "@/lib/format";

import type { GroupMetadata } from "./types";

// Group metadata lives off-chain at `Group.uri`, the JSON every membership NFT of the group points
// to. It follows the Metaplex token metadata standard so wallets and explorers can show the share;
// the app reads the property details from its attributes.

const LOCATION = "Location";
const PROPERTY_VALUE = "Property value (USD)";

interface NftMetadataJson {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  attributes: { trait_type: string; value: string | number }[];
  properties: { category: "image"; files: { uri: string; type: string }[] };
}

export function groupMetadataJson(
  content: { name: string; description: string; location: string; propertyValueUsd: number },
  { image, externalUrl }: { image: string; externalUrl?: string },
): NftMetadataJson {
  return {
    name: content.name,
    symbol: "KOTIZI",
    description: content.description,
    image,
    ...(externalUrl && { external_url: externalUrl }),
    attributes: [
      { trait_type: LOCATION, value: content.location },
      { trait_type: PROPERTY_VALUE, value: content.propertyValueUsd },
    ],
    properties: { category: "image", files: [{ uri: image, type: "image/svg+xml" }] },
  };
}

/** Reads the app's fields from a metadata JSON; null if it isn't one of ours. */
export function parseGroupMetadata(json: unknown): GroupMetadata | null {
  if (!json || typeof json !== "object") return null;
  const { description, attributes } = json as Partial<NftMetadataJson>;
  if (typeof description !== "string" || !Array.isArray(attributes)) return null;
  const attribute = (trait: string) => attributes.find((a) => a?.trait_type === trait)?.value;
  const location = attribute(LOCATION);
  const value = Number(attribute(PROPERTY_VALUE));
  if (typeof location !== "string" || !Number.isFinite(value) || value < 0) return null;
  return { description, location, propertyValue: usdc(value) };
}

/** Fetches and parses `Group.uri`. Missing or foreign metadata is not an error: the UI just omits it. */
async function fetchGroupMetadata(uri: string, init?: RequestInit): Promise<GroupMetadata | null> {
  if (!uri) return null;
  try {
    const response = await fetch(uri, init);
    return response.ok ? parseGroupMetadata(await response.json()) : null;
  } catch {
    return null;
  }
}

const fetched = new Map<string, Promise<GroupMetadata | null>>();

/** `fetchGroupMetadata` once per uri for the whole app: every network's client shares it, across rebuilds. */
export function cachedGroupMetadata(uri: string): Promise<GroupMetadata | null> {
  let metadata = fetched.get(uri);
  if (!metadata) {
    metadata = fetchGroupMetadata(uri);
    fetched.set(uri, metadata);
  }
  return metadata;
}
