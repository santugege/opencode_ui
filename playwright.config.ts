import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig, devices } from "@playwright/test";

const LOCAL_HOST = "127.0.0.1";
const projectEnv = loadProjectEnv();

const apiPort = readPort("PORT");
const opencodePort = readPort("OPENCODE_PORT");
const webPort = readPort("WEB_PORT");
const apiBaseUrl = `http://${LOCAL_HOST}:${apiPort}`;
const webBaseUrl = `http://${LOCAL_HOST}:${webPort}`;

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
    baseURL: webBaseUrl,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm --workspace apps/api run dev:e2e",
      env: {
        ARK_BASE_URL: requiredConfig("ARK_BASE_URL"),
        OPENCODE_MODE: "stub",
        OPENCODE_PORT: String(opencodePort),
        PORT: String(apiPort),
        WEB_PORT: String(webPort),
        WORKSPACE_PATH: requiredConfig("WORKSPACE_PATH"),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      url: `${apiBaseUrl}/health`,
    },
    {
      command: "npm --workspace apps/web run dev",
      env: {
        PORT: String(apiPort),
        WEB_PORT: String(webPort),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      url: webBaseUrl,
    },
  ],
});

function loadProjectEnv() {
  if (!existsSync(".env")) return {};
  return parseEnv(readFileSync(".env", "utf8"));
}

function configValue(name: string) {
  return process.env[name]?.trim() || projectEnv[name]?.trim();
}

function requiredConfig(name: string) {
  const value = configValue(name);
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

function readPort(name: "OPENCODE_PORT" | "PORT" | "WEB_PORT") {
  const port = Number(requiredConfig(name));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}
