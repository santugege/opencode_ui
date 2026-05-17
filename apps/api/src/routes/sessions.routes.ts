import { resolve } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { ApiHttpError } from "../app/errors";
import { errorMessage, sseHeaders, writeSseChunk, writeSseEvent } from "../app/sse";
import { serializeOpencodeSessionDetail, serializeOpencodeSessionSummary } from "../presenters/serializers";
import type { MemoryDatabase } from "../repositories/memory.repository";
import type { AuthService } from "../services/auth.service";
import type { OpencodeGateway } from "../services/opencode.service";
import { requireCurrentUser } from "./guards";

const DEFAULT_SESSION_TITLE = "未命名会话";

/**
 * 会话路由需要的依赖。
 */
export interface SessionRoutesOptions {
  /** 用于解析当前用户的认证服务。 */
  auth: AuthService;
  /** 用于序列化用户上传文件索引的仓储。 */
  db: MemoryDatabase;
  /** 所有会话路由共用的唯一 opencode 网关。 */
  opencode: OpencodeGateway;
}

interface CreateSessionBody {
  /** 可选的初始会话标题。 */
  title?: string;
}

interface SessionParams {
  /** URL 中的 opencode 会话 ID。 */
  sessionId: string;
}

interface SendMessageBody {
  /** 已上传到同一 opencode 会话的文件 ID。 */
  fileIds?: string[];
  /** 用户提示词文本。 */
  text?: string;
}

/**
 * 注册会话和消息路由。会话历史以 opencode 为唯一来源，本地只保留上传文件索引。
 */
export const sessionsRoutes: FastifyPluginAsync<SessionRoutesOptions> = async (app, options) => {
  app.get("/sessions", async (request) => {
    const current = requireCurrentUser(options.auth, request);
    // 首页只需要左侧历史摘要，因此这里禁止批量读取每个会话的消息详情。
    const [sessions, statuses] = await Promise.all([
      options.opencode.listSessions({ workspacePath: current.user.workspacePath }),
      options.opencode.listSessionStatuses({ workspacePath: current.user.workspacePath }),
    ]);

    return {
      sessions: sessions.map((session) =>
        serializeOpencodeSessionSummary({
          db: options.db,
          session,
          status: statuses[session.id],
          workspacePath: current.user.workspacePath,
        }),
      ),
    };
  });

  app.post<{ Body: CreateSessionBody }>("/sessions", async (request, reply) => {
    const current = requireCurrentUser(options.auth, request);
    const body = request.body ?? {};
    if (body.title !== undefined && typeof body.title !== "string") {
      throw new ApiHttpError(400, "Session title must be a string.");
    }

    const title = body.title?.trim() || DEFAULT_SESSION_TITLE;
    const session = await options.opencode.createSession({
      title,
      workspacePath: current.user.workspacePath,
    });

    reply.code(201);
    return {
      session: serializeOpencodeSessionSummary({
        db: options.db,
        session,
        status: { type: "idle" },
        workspacePath: current.user.workspacePath,
      }),
    };
  });

  app.get<{ Params: SessionParams }>("/sessions/:sessionId", async (request) => {
    const current = requireCurrentUser(options.auth, request);
    const session = await requireOwnedOpencodeSession(options.opencode, current.user.workspacePath, request.params.sessionId);
    // 只有用户明确打开某个历史会话时，才读取该会话的完整消息列表。
    const [messages, statuses] = await Promise.all([
      options.opencode.listMessages({
        sessionId: session.id,
        workspacePath: current.user.workspacePath,
      }),
      options.opencode.listSessionStatuses({ workspacePath: current.user.workspacePath }),
    ]);

    return {
      session: serializeOpencodeSessionDetail({
        db: options.db,
        messages,
        session,
        status: statuses[session.id],
        workspacePath: current.user.workspacePath,
      }),
    };
  });

  app.get<{ Params: SessionParams }>("/sessions/:sessionId/events", async (request, reply) => {
    const current = requireCurrentUser(options.auth, request);
    // 这里的 sessionId 只作为授权边界；事件流按当前用户工作区透传，不按单会话过滤。
    await requireOwnedOpencodeSession(options.opencode, current.user.workspacePath, request.params.sessionId);
    const eventStream = await options.opencode.subscribeEvents({ workspacePath: current.user.workspacePath });
    const raw = reply.raw;
    const headers = sseHeaders(reply.getHeaders());

    reply.hijack();
    raw.writeHead(200, headers);
    raw.write(": connected to opencode event stream\n\n");

    const reader = eventStream.body.getReader();
    let closed = false;
    const closeStream = () => {
      closed = true;
      eventStream.close();
      void reader.cancel().catch(() => undefined);
    };

    raw.once("close", closeStream);
    try {
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (raw.destroyed || raw.writableEnded) break;
        await writeSseChunk(raw, value);
      }
    } catch (error) {
      if (!closed && !raw.destroyed && !raw.writableEnded) {
        await writeSseEvent(raw, "opencode.stream.error", { error: errorMessage(error) });
      }
    } finally {
      raw.off("close", closeStream);
      eventStream.close();
      if (!raw.destroyed && !raw.writableEnded) raw.end();
    }
  });

  app.post<{ Body: SendMessageBody; Params: SessionParams }>("/sessions/:sessionId/messages", async (request, reply) => {
    const current = requireCurrentUser(options.auth, request);
    const session = await requireOwnedOpencodeSession(options.opencode, current.user.workspacePath, request.params.sessionId);

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

    await options.opencode.sendPromptAsync({
      files: attachedFiles.map((file) => ({
        absolutePath: resolve(current.user.workspacePath, file.relativePath),
        filename: file.name,
        mimeType: file.mimeType,
      })),
      sessionId: session.id,
      text,
      workspacePath: current.user.workspacePath,
    });

    reply.code(202);
    return {
      accepted: true,
      eventsPath: `/sessions/${session.id}/events`,
      sessionId: session.id,
    };
  });
};

/**
 * 通过当前用户工作区反查会话，防止浏览器直接访问其他工作区的 opencode 会话。
 */
async function requireOwnedOpencodeSession(opencode: OpencodeGateway, workspacePath: string, sessionId: string | undefined) {
  if (!sessionId) throw new ApiHttpError(404, "Session not found.");

  const sessions = await opencode.listSessions({ workspacePath });
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new ApiHttpError(404, "Session not found.");
  return session;
}
