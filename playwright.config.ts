import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: process.env.DEMO_URL ?? "http://127.0.0.1:4173/wow-icon-browser/",
    headless: true,
  },
  webServer: process.env.DEMO_URL
    ? undefined
    : {
        command: "bun run preview --port 4173",
        url: "http://127.0.0.1:4173/wow-icon-browser/",
        reuseExistingServer: true,
        timeout: 30000,
      },
});
