import { groupMetadataJson } from "@/chain/metadata";
import { GROUP_CONTENT, isGroupSlug } from "@/content/groups";

// `GET /metadata/<slug>.json[?value=<usd>]`: the NFT metadata behind a group's `uri`. `value` is the
// property value the admin set when creating the group (else the content's). Public and CORS-open,
// since wallets, explorers and indexers fetch it from other origins.
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300",
};

export async function GET(request: Request, ctx: RouteContext<"/metadata/[file]">) {
  const { file } = await ctx.params;
  const slug = file.endsWith(".json") ? file.slice(0, -".json".length) : null;
  if (!slug || !isGroupSlug(slug)) {
    return Response.json({ error: "Unknown group metadata" }, { status: 404, headers: HEADERS });
  }
  const url = new URL(request.url);
  const value = Number(url.searchParams.get("value"));
  const content = GROUP_CONTENT[slug];
  const origin = url.origin;
  const json = groupMetadataJson(Number.isFinite(value) && value > 0 ? { ...content, propertyValueUsd: value } : content, {
    image: `${origin}/brand/symbol-white.svg`,
    externalUrl: `${origin}/groups`,
  });
  return Response.json(json, { headers: HEADERS });
}
