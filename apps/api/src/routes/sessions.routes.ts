import { resolve } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { ApiHttpError } from "../app/errors";
import { serializeMessage, serializeSession } from "../presenters/serializers";
import type { MemoryDatabase } from "../repositories/memory.repository";
import type { AuthService } from "../services/auth.service";
import type { OpencodeGateway } from "../services/opencode.service";
import type { SessionService } from "../services/session.service";
import { requireCurrentUser } from "./guards";

const DEFAULT_SESSION_TITLE = "未命名会话";

/**
 * 会话路由需要的依赖。
 */
export interface SessionRoutesOptions {
  /** 用于解析当前用户的认证服务。 */
  auth: AuthService;
  /** 用于序列化文件和消息的仓储。 */
  db: MemoryDatabase;
  /** 所有会话路由共用的唯一 opencode 网关。 */
  opencode: OpencodeGateway;
  /** 包含工作区和消息业务逻辑的会话服务。 */
  sessions: SessionService;
}

interface CreateSessionBody {
  /** 可选的初始会话标题。 */
  title?: string;
}

interface SessionParams {
  /** URL 中的应用会话 ID。 */
  sessionId: string;
}

interface SendMessageBody {
  /** 已上传到同一会话的文件 ID。 */
  fileIds?: string[];
  /** 用户提示词文本。 */
  text?: string;
}

/**
 * 注册会话和消息路由。
 */
export const sessionsRoutes: FastifyPluginAsync<SessionRoutesOptions> = async (app, options) => {
  app.get("/sessions", async (request) => {
    const current = requireCurrentUser(options.auth, request);
    return {
      sessions: options.sessions.listByUserId(current.user.id).map((session) => serializeSession(session, options.db)),
    };
  });

  app.post<{ Body: CreateSessionBody }>("/sessions", async (request, reply) => {
    const current = requireCurrentUser(options.auth, request);
    const body = request.body ?? {};
    if (body.title !== undefined && typeof body.title !== "string") {
      throw new ApiHttpError(400, "Session title must be a string.");
    }
    const title = body.title?.trim() || DEFAULT_SESSION_TITLE;
    const session = await options.sessions.createPendingSession({ title, userId: current.user.id });
    const opencodeSession = await options.opencode.createSession({
      title,
      workspacePath: session.workspacePath,
    });
    const bound = options.sessions.bindOpencodeSession({
      opencodeSessionId: opencodeSession.id,
      sessionId: session.id,
    });

    reply.code(201);
    return { session: serializeSession(bound, options.db) };
  });

  app.post<{ Body: SendMessageBody; Params: SessionParams }>("/sessions/:sessionId/messages", async (request, reply) => {
    const current = requireCurrentUser(options.auth, request);
    const session = options.sessions.findOwnedSession(current.user.id, request.params.sessionId);
    if (!session) throw new ApiHttpError(404, "Session not found.");
    if (!session.opencodeSessionId) throw new ApiHttpError(409, "Session is not bound to opencode.");

    const body = request.body ?? {};
    if (body.text !== undefined && typeof body.text !== "string") {
      throw new ApiHttpError(400, "Message text must be a string.");
    }
    const text = body.text?.trim();
    if (!text) throw new ApiHttpError(400, "Message text is required.");
    if (body.fileIds !== undefined && !Array.isArray(body.fileIds)) {
      throw new ApiHttpError(400, "File ids must be an array.");
    }

    const allFiles = options.db.listSessionFiles(session.id);
    const requestedFileIds = new Set(body.fileIds ?? []);
    const attachedFiles = allFiles.filter((file) => requestedFileIds.has(file.id));
    if (attachedFiles.length !== requestedFileIds.size) {
      throw new ApiHttpError(400, "One or more attached files were not found.");
    }

    await options.opencode.sendPrompt({
      files: attachedFiles.map((file) => ({
        absolutePath: resolve(session.workspacePath, file.relativePath),
        filename: file.name,
        mimeType: file.mimeType,
      })),
      opencodeSessionId: session.opencodeSessionId,
      text,
      workspacePath: session.workspacePath,
    });

    const result = options.sessions.recordUserMessage({
      files: attachedFiles,
      session,
      text,
    });

    reply.code(201);
    return {
      message: serializeMessage(result.message),
      session: serializeSession(result.session, options.db),
    };
  });
};
