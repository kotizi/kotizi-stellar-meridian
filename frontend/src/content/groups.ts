// Off-chain description of each group's property, served as the NFT metadata JSON behind
// `Group.uri` (`/metadata/<slug>.json`). The mock seed reads the same entries.

interface GroupContent {
  name: string;
  description: string;
  location: string;
  /** Suggested value of the property, in whole USD (the admin sets the group's own when creating it). */
  propertyValueUsd: number;
}

export const GROUP_CONTENT = {
  "studio-pinheiros": {
    name: "Studio Pinheiros",
    description: "Studio apartment two blocks from a metro station, close to offices and nightlife.",
    location: "São Paulo, SP",
    propertyValueUsd: 72_000,
  },
  "residencial-aurora": {
    name: "Residencial Aurora",
    description: "Two-bedroom apartment with a balcony in a new building in Savassi.",
    location: "Belo Horizonte, MG",
    propertyValueUsd: 96_000,
  },
  "casa-ipe": {
    name: "Casa Ipê",
    description: "Three-bedroom townhouse with a small garden on a quiet residential street.",
    location: "Curitiba, PR",
    propertyValueUsd: 180_000,
  },
  "mar-azul": {
    name: "Mar Azul Flats",
    description: "One-bedroom flat a five-minute walk from the beach, rented furnished.",
    location: "Florianópolis, SC",
    propertyValueUsd: 120_000,
  },
  "vila-cerrado": {
    name: "Vila Cerrado",
    description: "Two-bedroom apartment in a leafy block, near schools and a park.",
    location: "Brasília, DF",
    propertyValueUsd: 144_000,
  },
  "porto-novo": {
    name: "Porto Novo Lofts",
    description: "Loft in a restored riverside warehouse in the historic center.",
    location: "Recife, PE",
    propertyValueUsd: 60_000,
  },
  "jardim-botanico": {
    name: "Jardim Botânico",
    description: "Two-bedroom apartment facing the hills, next to the botanical garden.",
    location: "Rio de Janeiro, RJ",
    propertyValueUsd: 240_000,
  },
  "solar-do-sul": {
    name: "Solar do Sul",
    description: "Three-bedroom apartment with parking in a tree-lined neighborhood.",
    location: "Porto Alegre, RS",
    propertyValueUsd: 192_000,
  },
  "brisa-mar": {
    name: "Brisa Mar",
    description: "Two-bedroom apartment one block from the seafront promenade.",
    location: "Fortaleza, CE",
    propertyValueUsd: 84_000,
  },
  "casa-serra": {
    name: "Casa Serra",
    description: "Three-bedroom house in a gated community, 15 minutes from downtown.",
    location: "Campinas, SP",
    propertyValueUsd: 288_000,
  },
} satisfies Record<string, GroupContent>;

export type GroupSlug = keyof typeof GROUP_CONTENT;

export const isGroupSlug = (slug: string): slug is GroupSlug => Object.hasOwn(GROUP_CONTENT, slug);
