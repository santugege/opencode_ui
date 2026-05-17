import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseEnv } from "node:util";
import type { OpencodeMode } from "../services/opencode.service";

const ENV_FILE_NAME = ".env";
const LOCAL_HOST = "127.0.0.1";
let projectEnv: NodeJS.Dict<string> | undefined;

/**
 * 创建 Fastify 应用时使用的运行时配置。
 */
export interface RuntimeConfig {
  /** API 服务监听地址。 */
  apiHost: string;
  /** API 服务监听端口。 */
  apiPort: number;
  /** 火山 Ark API Key，仅在视频任务代理路由中使用。 */
  arkApiKey?: string;
  /** 火山 Ark API 基础地址。 */
  arkBaseUrl: string;
  /** 允许携带凭证发起请求的浏览器来源。 */
  corsOrigins: string[];
  /** 当前进程是否负责托管 opencode HTTP 服务。 */
  managedOpencode: boolean;
  /** opencode 服务基础 URL。 */
  opencodeBaseUrl: string;
  /** 当前进程托管 opencode HTTP 服务时使用的监听地址。 */
  opencodeHost: string;
  /** opencode 调用使用真实 SDK 还是确定性桩实现。 */
  opencodeMode: OpencodeMode;
  /** 当前进程托管 opencode HTTP 服务时使用的监听端口。 */
  opencodePort: number;
  /** 存放所有用户工作区的根目录。 */
  storageRoot: string;
}

/**
 * 测试或嵌入式调用方可传入的运行时覆盖配置。
 */
export interface RuntimeConfigOverrides {
  apiPort?: number;
  arkApiKey?: string;
  arkBaseUrl?: string;
  corsOrigins?: string[];
  managedOpencode?: boolean;
  opencodeBaseUrl?: string;
  opencodeMode?: OpencodeMode;
  opencodePort?: number;
  storageRoot?: string;
}

/**
 * 将进程环境变量和调用方覆盖项合并为单一配置对象。
 */
export function loadRuntimeConfig(overrides: RuntimeConfigOverrides = {}): RuntimeConfig {
  const apiPort = overrides.apiPort ?? readPort("PORT");
  const opencodePort = overrides.opencodePort ?? readPort("OPENCODE_PORT");
  const opencodeMode = overrides.opencodeMode ?? configuredOpencodeMode();

  if (opencodeMode !== "live" && opencodeMode !== "stub") {
    throw new Error("opencodeMode must be either live or stub.");
  }

  return {
    apiHost: LOCAL_HOST,
    apiPort,
    arkApiKey: overrides.arkApiKey ?? optionalProcessEnv("ARK_API_KEY"),
    arkBaseUrl: overrides.arkBaseUrl ?? requiredConfig("ARK_BASE_URL"),
    corsOrigins: overrides.corsOrigins ?? localCorsOrigins(readPort("WEB_PORT")),
    managedOpencode: overrides.managedOpencode ?? opencodeMode === "live",
    opencodeBaseUrl: overrides.opencodeBaseUrl ?? localBaseUrl(LOCAL_HOST, opencodePort),
    opencodeHost: LOCAL_HOST,
    opencodeMode,
    opencodePort,
    storageRoot: overrides.storageRoot ?? resolve(process.cwd(), requiredConfig("WORKSPACE_PATH")),
  };
}

function configValue(name: string) {
  return process.env[name]?.trim() || projectEnvValue(name);
}

function findEnvFile(startDir: string): string | undefined {
  let currentDir = startDir;
  while (true) {
    const candidate = resolve(currentDir, ENV_FILE_NAME);
    if (existsSync(candidate)) return candidate;

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return undefined;
    currentDir = parentDir;
  }
}

function optionalProcessEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function projectEnvValue(name: string) {
  projectEnv ??= loadProjectEnv();
  const value = projectEnv[name]?.trim();
  return value || undefined;
}

function loadProjectEnv() {
  const envFile = findEnvFile(process.cwd());
  return envFile ? parseEnv(readFileSync(envFile, "utf8")) : {};
}

function requiredConfig(name: string) {
  const value = configValue(name);
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

function configuredOpencodeMode(): OpencodeMode {
  const mode = optionalProcessEnv("OPENCODE_MODE") ?? "live";
  if (mode === "live" || mode === "stub") return mode;
  throw new Error("OPENCODE_MODE must be either live or stub.");
}

function readPort(name: "OPENCODE_PORT" | "PORT" | "WEB_PORT") {
  const port = Number(requiredConfig(name));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

function localCorsOrigins(webPort: number) {
  return [`http://${LOCAL_HOST}:${webPort}`, `http://localhost:${webPort}`];
}

function localBaseUrl(host: string, port: number) {
  return `http://${host}:${port}`;
}
