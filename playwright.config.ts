import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  tsconfig: "./tsconfig.playwright.json",
  webServer: {
    command: "pnpm --filter @admiral/showcase dev --host 127.0.0.1",
    url: "http://localhost:5173",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://localhost:5173",
    launchOptions: {
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    },
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
