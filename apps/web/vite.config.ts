import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const envDir = fileURLToPath(new URL("../..", import.meta.url));
const LOCAL_HOST = "127.0.0.1";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, "");

  return {
    envDir,
    envPrefix: ["VITE_", "PORT"],
    plugins: [react()],
    server: {
      host: LOCAL_HOST,
      port: readPort(env, "WEB_PORT"),
      strictPort: true,
    },
  };
});

function requiredEnv(env: Record<string, string>, name: string) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

function readPort(env: Record<string, string>, name: string) {
  const port = Number(requiredEnv(env, name));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}
