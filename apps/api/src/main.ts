import { createOpencodeServer } from "@opencode-ai/sdk/server";
import { createApiServer, type ApiServer } from "./app/createApp";
import { loadRuntimeConfig, type RuntimeConfig } from "./config/env";

/**
 * API 进程托管的 opencode HTTP 服务句柄。
 */
interface ManagedOpencodeServer {
  /** 传给 SDK client 的 opencode 服务基础 URL。 */
  url: string;
  /** 释放 opencode 子进程资源。 */
  close(): void;
}

void bootstrap().catch((error) => {
  console.error("[api] startup failed", error);
  process.exit(1);
});

/**
 * 启动 API 服务，并在需要时先启动同进程托管的 opencode HTTP 服务。
 */
async function bootstrap() {
  const config = loadRuntimeConfig();
  const managedOpencode = await startManagedOpencodeServer(config);
  const app = createApiServer({
    arkApiKey: config.arkApiKey,
    arkBaseUrl: config.arkBaseUrl,
    corsOrigins: config.corsOrigins,
    managedOpencode: config.managedOpencode,
    opencodeBaseUrl: managedOpencode?.url ?? config.opencodeBaseUrl,
    opencodeOnClose: managedOpencode?.close,
    opencodeMode: config.opencodeMode,
    opencodePort: config.opencodePort,
    storageRoot: config.storageRoot,
  });

  installShutdownHandlers(app);

  try {
    const address = await app.listen({ host: config.apiHost, port: config.apiPort });
    console.log(`[api] listening on ${address}`);
  } catch (error) {
    await app.close();
    throw error;
  }
}

/**
 * 默认由当前项目托管 opencode；测试模式和显式外部地址保持不启动子进程。
 */
async function startManagedOpencodeServer(config: RuntimeConfig): Promise<ManagedOpencodeServer | undefined> {
  if (!config.managedOpencode) {
    if (config.opencodeMode === "stub") {
      console.log("[opencode] stub mode enabled; managed HTTP service skipped");
    } else {
      console.log(`[opencode] using external HTTP service at ${config.opencodeBaseUrl}`);
    }
    return undefined;
  }

  console.log(`[opencode] starting managed HTTP service on ${config.opencodeHost}:${config.opencodePort}`);
  const server = await createOpencodeServer({ hostname: config.opencodeHost, port: config.opencodePort });
  console.log(`[opencode] managed HTTP service listening at ${server.url}`);

  return {
    url: server.url,
    close() {
      console.log("[opencode] stopping managed HTTP service");
      server.close();
      console.log("[opencode] managed HTTP service stopped");
    },
  };
}

/**
 * 将正常信号和异常退出都收口到 Fastify close，确保 onClose 钩子释放 opencode。
 */
function installShutdownHandlers(app: ApiServer) {
  let isShuttingDown = false;

  async function shutdown(exitCode: number, reason: unknown) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (reason instanceof Error) {
      console.error("[api] shutting down after fatal error", reason);
    } else {
      console.log(`[api] shutting down after ${String(reason)}`);
    }

    try {
      await app.close();
    } catch (error) {
      console.error("[api] shutdown failed", error);
      process.exit(1);
    }

    process.exit(exitCode);
  }

  process.once("SIGINT", () => {
    void shutdown(0, "SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown(0, "SIGTERM");
  });
  process.once("uncaughtException", (error) => {
    void shutdown(1, error);
  });
  process.once("unhandledRejection", (reason) => {
    void shutdown(1, reason);
  });
}
