import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  projects: [
    // Signs in once and saves the session for the other projects.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  // The flows run against the mock chain client and the mock session (no Privy).
  webServer: {
    command: "bun run dev --port 5000",
    url: "http://localhost:5000",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_CHAIN_CLIENT: "mock",
      NEXT_PUBLIC_PRIVY_APP_ID: "",
    },
  },
  use: {
    baseURL: "http://localhost:5000",
  },
  // The dev server compiles each route on its first visit (and a build empties its cache).
  expect: { timeout: 15_000 },
});
