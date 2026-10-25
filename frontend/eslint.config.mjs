import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// UI → chain boundary: screens talk to KotiziClient and useSession() only.
// Features are reached only through their index (`@/features/<name>`); inside one, relative imports.
const uiPatterns = [
  { group: ["@stellar/*"], message: "UI must not import chain SDKs; use @/chain hooks." },
  { group: ["@/chain/stellar/*", "@/chain/mock/*"], message: "UI must not import chain implementations; use the KotiziClient hooks." },
  { group: ["@privy-io/*", "@/session/privy-*"], message: "UI reads the session only through useSession()." },
  { group: ["@/features/*/*"], message: "Import a feature from its index: @/features/<name>." },
];

// Design system (`kz/`, `ui/`): presentation only, it knows nothing about the product.
const designSystemPatterns = [
  { group: ["@/chain", "@/chain/*", "@/session/*", "@/content/*", "@/config/*", "@/features/*", "@/app/*"], message: "The design system (kz/, ui/) must not depend on the product; take data through props." },
  { group: ["@/components/*", "!@/components/ui", "!@/components/kz"], message: "The design system (kz/, ui/) imports only ui/ and kz/; product components live elsewhere." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/**", "src/components/**", "src/features/**"],
    rules: { "no-restricted-imports": ["error", { patterns: uiPatterns }] },
  },
  // A later block replaces the rule's patterns for its files instead of adding to them: repeat uiPatterns.
  {
    files: ["src/components/kz/**", "src/components/ui/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [...uiPatterns, ...designSystemPatterns] }] },
  },
  // chain → UI boundary: the chain layer never depends on screens (tests may wire both).
  {
    files: ["src/chain/**"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/components/*", "@/app/*", "@/features/*"], message: "chain/ must not import UI." },
        ],
      }],
    },
  },
  // Every promise is awaited, returned or explicitly voided (`void doThing()`).
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Codama output (bun run codegen).
    "src/chain/stellar/generated/**",
  ]),
]);

export default eslintConfig;
