import { randomUUID } from "node:crypto";
import type { SessionFile, WorkspaceSession } from "@opencode-ui/shared";
import type { MemoryDatabase } from "../repositories/memory.repository";
import type { WorkspaceManager } from "./workspace.service";

const DEFAULT_SESSION_TITLES = new Set(["Untitled session", "未命名会话"]);
const DEFAULT_SESSION_TITLE = "未命名会话";

/**
 * 会话服务需要的依赖。
 */
export interface SessionServiceOptions {
  /** 用于持久化会话和消息的仓储。 */
  db: MemoryDatabase;
  /** 用于创建用户专属目录的工作区管理器。 */
  workspaces: WorkspaceManager;
}

/**
 * 绑定 opencode 前创建应用会话的入参。
 */
export interface CreatePendingSessionInput {
  /** 拥有该会话和工作区的用户 ID。 */
  userId: string;
  /** 初始 UI 标题。 */
  title: string;
}

/**
 * 将应用会话绑定到 opencode 会话 ID 的入参。
 */
export interface BindOpencodeSessionInput {
  /** 应用会话 ID。 */
  sessionId: string;
  /** SDK 返回的 opencode 会话 ID。 */
  opencodeSessionId: string;
}

/**
 * opencode 接收提示词后记录用户消息的入参。
 */
export interface RecordUserMessageInput {
  /** 接收消息的会话。 */
  session: WorkspaceSession;
  /** 用户输入的纯文本提示词。 */
  text: string;
  /** 附加到该消息的文件。 */
  files: SessionFile[];
}

/**
 * 创建路由层使用的工作区/会话服务。
 */
export function createSessionService(options: SessionServiceOptions) {
  return {
    async createPendingSession(input: CreatePendingSessionInput): Promise<WorkspaceSession> {
      const now = new Date().toISOString();
      const id = randomUUID();
      const workspace = await options.workspaces.createSessionWorkspace({
        userId: input.userId,
        sessionId: id,
      });

      return options.db.createWorkspaceSession({
        id,
        userId: input.userId,
        opencodeSessionId: null,
        title: input.title,
        status: "ready",
        workspacePath: workspace.absolutePath,
        createdAt: now,
        updatedAt: now,
      });
    },

    bindOpencodeSession(input: BindOpencodeSessionInput) {
      const existing = options.db.findWorkspaceSessionById(input.sessionId);
      if (!existing) throw new Error("Workspace session not found");

      return options.db.updateWorkspaceSession({
        ...existing,
        opencodeSessionId: input.opencodeSessionId,
        updatedAt: new Date().toISOString(),
      });
    },

    findOwnedSession(userId: string, sessionId: string | undefined) {
      if (!sessionId) return undefined;
      const session = options.db.findWorkspaceSessionById(sessionId);
      return session?.userId === userId ? session : undefined;
    },

    listByUserId(userId: string) {
      return options.db.listWorkspaceSessionsByUserId(userId);
    },

    recordUserMessage(input: RecordUserMessageInput) {
      const message = options.db.createChatMessage({
        content: input.text,
        createdAt: new Date().toISOString(),
        files: input.files,
        id: randomUUID(),
        role: "user",
        sessionId: input.session.id,
      });
      const updated = options.db.updateWorkspaceSession({
        ...input.session,
        status: "ready",
        title: isDefaultSessionTitle(input.session.title) ? titleFromMessage(input.text) : input.session.title,
        updatedAt: message.createdAt,
      });

      return { message, session: updated };
    },
  };
}

/**
 * 根据第一条用户消息生成简短标题。
 */
export function titleFromMessage(text: string) {
  return text.split(/\s+/).slice(0, 5).join(" ").slice(0, 60) || DEFAULT_SESSION_TITLE;
}

/**
 * 判断本地默认会话标题是否应被首条提示词替换。
 */
export function isDefaultSessionTitle(title: string) {
  return DEFAULT_SESSION_TITLES.has(title.trim());
}

export type SessionService = ReturnType<typeof createSessionService>;
