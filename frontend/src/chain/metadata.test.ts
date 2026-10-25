import { describe, expect, test } from "bun:test";

import { GET } from "@/app/metadata/[file]/route";
import { GROUP_CONTENT } from "@/content/groups";

import { groupMetadataJson, parseGroupMetadata } from "./metadata";

const image = "https://kotizi.test/brand/symbol-white.svg";

describe("group metadata JSON", () => {
  test("round-trips the property details through the NFT attributes", () => {
    const json = groupMetadataJson(GROUP_CONTENT["studio-pinheiros"], { image });
    expect(json.name).toBe("Studio Pinheiros");
    expect(json.image).toBe(image);
    expect(parseGroupMetadata(json)).toEqual({
      description: GROUP_CONTENT["studio-pinheiros"].description,
      location: "São Paulo, SP",
      propertyValue: 72_000_000_000n,
    });
  });

  test("survives a trip through JSON text, as fetched from the uri", () => {
    const text = JSON.stringify(groupMetadataJson(GROUP_CONTENT["casa-ipe"], { image }));
    expect(parseGroupMetadata(JSON.parse(text))?.propertyValue).toBe(180_000_000_000n);
  });

  test("ignores JSON that isn't group metadata", () => {
    expect(parseGroupMetadata(null)).toBeNull();
    expect(parseGroupMetadata({ name: "Some NFT", description: "x", attributes: [] })).toBeNull();
    expect(
      parseGroupMetadata({
        description: "x",
        attributes: [
          { trait_type: "Location", value: "Somewhere" },
          { trait_type: "Property value (USD)", value: "not a number" },
        ],
      }),
    ).toBeNull();
  });
});

describe("GET /metadata/[file]", () => {
  const get = (file: string, query = "") =>
    GET(new Request(`https://kotizi.test/metadata/${file}${query}`), { params: Promise.resolve({ file }) });

  test("serves a known group with absolute image URL and CORS", async () => {
    const response = await get("studio-pinheiros.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const json = await response.json();
    expect(json.image).toBe(image);
    expect(parseGroupMetadata(json)?.location).toBe("São Paulo, SP");
  });

  test("takes the property value set at creation from ?value=, else the content's", async () => {
    const value = async (query: string) =>
      parseGroupMetadata(await (await get("porto-novo.json", query)).json())?.propertyValue;
    expect(await value("?value=75000")).toBe(75_000_000_000n);
    expect(await value("?value=abc")).toBe(60_000_000_000n);
    expect(await value("")).toBe(60_000_000_000n);
  });

  test("404s unknown slugs and paths without .json", async () => {
    expect((await get("nope.json")).status).toBe(404);
    expect((await get("studio-pinheiros")).status).toBe(404);
    expect((await get("constructor.json")).status).toBe(404);
  });
});
