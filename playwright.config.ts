import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  outputDir: "output/playwright/test-results",
  projects: [
    {
      name: "edge",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
      },
    },
  ],
  reporter: [["list"]],
  testDir: "apps/web/e2e",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm --workspace apps/api run dev:e2e",
      env: {
        CORS_ORIGINS: "http://127.0.0.1:5173",
        OPENCODE_UI_TEST_MODE: "1",
        PORT: "8787",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      url: "http://127.0.0.1:8787/health",
    },
    {
      command: "npm --workspace apps/web run dev -- --port 5173",
      env: {
        VITE_API_BASE_URL: "http://127.0.0.1:8787",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      url: "http://127.0.0.1:5173",
    },
  ],
});
