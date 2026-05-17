import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const envDir = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  envDir,
  envPrefix: ["VITE_", "PORT"],
  plugins: [react()],
  test: {
    environment: "jsdom",
    exclude: ["**/e2e/**", "**/node_modules/**", "**/dist/**"],
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
