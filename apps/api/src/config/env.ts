import { resolve } from "node:path";
import type { OpencodeMode } from "../services/opencode.service";

/**
 * 创建 Fastify 应用时使用的运行时配置。
 */
export interface RuntimeConfig {
  /** 允许携带凭证发起请求的浏览器来源。 */
  corsOrigins: string[];
  /** opencode 服务基础 URL。 */
  opencodeBaseUrl: string;
  /** opencode 调用使用真实 SDK 还是确定性桩实现。 */
  opencodeMode: OpencodeMode;
  /** 存放所有用户工作区的根目录。 */
  storageRoot: string;
}

/**
 * 测试或嵌入式调用方可传入的运行时覆盖配置。
 */
export interface RuntimeConfigOverrides {
  corsOrigins?: string[];
  opencodeBaseUrl?: string;
  opencodeMode?: OpencodeMode;
  storageRoot?: string;
}

/**
 * 将进程环境变量和调用方覆盖项合并为单一配置对象。
 */
export function loadRuntimeConfig(overrides: RuntimeConfigOverrides = {}): RuntimeConfig {
  return {
    corsOrigins: overrides.corsOrigins ?? configuredCorsOrigins(),
    opencodeBaseUrl: overrides.opencodeBaseUrl ?? process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096",
    opencodeMode: overrides.opencodeMode ?? (process.env.OPENCODE_UI_TEST_MODE === "1" ? "stub" : "live"),
    storageRoot: overrides.storageRoot ?? resolve(process.cwd(), "storage", "workspaces"),
  };
}

function configuredCorsOrigins() {
  return (process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
