import fastify, { type FastifyInstance } from "fastify";
import { loadRuntimeConfig, type RuntimeConfigOverrides } from "../config/env";
import { createMemoryDatabase, type MemoryDatabase } from "../repositories/memory.repository";
import { authRoutes } from "../routes/auth.routes";
import { filesRoutes } from "../routes/files.routes";
import { healthRoutes } from "../routes/health.routes";
import { modelsRoutes } from "../routes/models.routes";
import { questionsRoutes } from "../routes/questions.routes";
import { responsesRoutes } from "../routes/responses.routes";
import { sessionsRoutes } from "../routes/sessions.routes";
import { videoTasksRoutes } from "../routes/videoTasks.routes";
import { createAuthService } from "../services/auth.service";
import { createFileService } from "../services/file.service";
import {
  createConfiguredOpencodeGateway,
  type CreateOpencodeSessionFn,
  type OpencodeMode,
  type SendPromptFn,
} from "../services/opencode.service";
import { createVideoTaskService } from "../services/videoTask.service";
import { createWorkspaceManager } from "../services/workspace.service";
import type { JsonFetchOptions, JsonResponse } from "../types/http";
import { applyCorsHeaders } from "./cors";
import { registerErrorHandler } from "./errors";

/**
 * 创建 API 应用时接收的配置项。
 */
export interface ApiServerOptions extends RuntimeConfigOverrides {
  /** 测试或嵌入式调用方可覆盖的仓储实现。 */
  db?: MemoryDatabase;
  /** API 服务关闭时需要同步释放的 opencode 运行时资源。 */
  opencodeOnClose?: () => Promise<void> | void;
  /** 显式指定的 opencode 模式。 */
  opencodeMode?: OpencodeMode;
  /** 可选的 opencode 会话创建覆盖实现。 */
  createOpencodeSession?: CreateOpencodeSessionFn;
  /** 可选的 opencode 提示词发送覆盖实现。 */
  sendPrompt?: SendPromptFn;
}

/**
 * 扩展了进程内 JSON 请求辅助方法的 Fastify 实例。
 */
export type ApiServer = FastifyInstance & {
  fetchJson(path: string, input?: JsonFetchOptions): Promise<JsonResponse>;
};

/**
 * 创建 Fastify API 应用，并装配所有路由依赖。
 */
export function createApiServer(options: ApiServerOptions = {}): ApiServer {
  const config = loadRuntimeConfig(options);
  const db = options.db ?? createMemoryDatabase();
  const workspaces = createWorkspaceManager({ root: config.storageRoot });
  const auth = createAuthService(db, workspaces);
  const files = createFileService({ db });
  const videoTasks = createVideoTaskService({
    apiKey: config.arkApiKey,
    baseUrl: config.arkBaseUrl,
  });
  const opencode = createConfiguredOpencodeGateway({
    baseUrl: config.opencodeBaseUrl,
    createOpencodeSession: options.createOpencodeSession,
    mode: config.opencodeMode,
    sendPrompt: options.sendPrompt,
  });
  const app = fastify({ logger: false });
  const corsOrigins = new Set(config.corsOrigins);

  app.addHook("onRequest", async (request, reply) => {
    applyCorsHeaders(request, reply, corsOrigins);
    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  registerErrorHandler(app);
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: "Not found" });
  });

  // Fastify close 是正常退出、信号退出和异常退出的统一收口点。
  app.addHook("onClose", async () => {
    await options.opencodeOnClose?.();
  });

  app.register(healthRoutes);
  app.register(authRoutes, { auth });
  app.register(modelsRoutes, { auth, opencode });
  app.register(questionsRoutes, { auth, opencode });
  app.register(responsesRoutes, { auth, db, opencode });
  app.register(sessionsRoutes, { auth, db, opencode });
  app.register(filesRoutes, { auth, files, opencode });
  app.register(videoTasksRoutes, { auth, videoTasks });

  return Object.assign(app, {
    async fetchJson(path: string, input: JsonFetchOptions = {}) {
      const headers = { ...(input.headers ?? {}) };
      const hasBody = input.body !== undefined;
      const response = await app.inject({
        headers: hasBody ? withJsonContentType(headers) : headers,
        method: input.method ?? "GET",
        payload: hasBody ? JSON.stringify(input.body) : undefined,
        url: path,
      });

      return {
        body: parseBody(response.body),
        headers: toWebHeaders(response.headers),
        status: response.statusCode,
      };
    },
  });
}

function withJsonContentType(headers: Record<string, string>) {
  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    return { ...headers, "content-type": "application/json" };
  }
  return headers;
}

function parseBody(body: string) {
  if (!body) return undefined;
  return JSON.parse(body);
}

function toWebHeaders(headers: Record<string, string | string[] | undefined>) {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      result.set(key, value.join(", "));
    } else if (value !== undefined) {
      result.set(key, String(value));
    }
  }
  return result;
}
