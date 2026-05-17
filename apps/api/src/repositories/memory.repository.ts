import type { SessionFile, User } from "@opencode-ui/shared";

/**
 * 与用户记录关联的密码哈希。
 */
export interface PasswordHashRecord {
  /** 拥有该密码哈希的用户 ID。 */
  userId: string;
  /** 带算法前缀的密码哈希值。 */
  passwordHash: string;
}

/**
 * 用户登录后持久化的浏览器会话。
 */
export interface UserSessionRecord {
  /** 存储在 HTTP-only cookie 中的不透明会话标识。 */
  id: string;
  /** 已认证用户 ID。 */
  userId: string;
  /** ISO 时间戳，用于审计和后续过期处理。 */
  createdAt: string;
}

export type ResponseStatus = "in_progress" | "completed" | "failed" | "cancelled";

/**
 * OpenAI Responses 兼容层的响应记录，用于把 response id 映射回 opencode 会话。
 */
export interface ResponseRecord {
  /** 对外暴露的 response id。 */
  id: string;
  /** 拥有该响应的用户 ID。 */
  userId: string;
  /** 承载本次响应的 opencode 会话 ID。 */
  sessionId: string;
  /** 当前响应状态，用于取消和流式收尾事件。 */
  status: ResponseStatus;
  /** 可选的上一条 response id，保留 Responses API 链路语义。 */
  previousResponseId?: string;
  /** ISO 创建时间。 */
  createdAt: string;
  /** ISO 更新时间。 */
  updatedAt: string;
}

/**
 * 服务层使用的仓储契约。当前实现为内存存储，路由只依赖该接口，
 * 未来替换为持久化存储时不需要修改 HTTP 处理器。
 */
export interface MemoryDatabase {
  createUser(input: { createdAt: string; email: string; id: string; workspacePath: string }): User;
  findUserByEmail(email: string): User | undefined;
  findUserById(id: string): User | undefined;
  setPasswordHash(input: PasswordHashRecord): void;
  getPasswordHashByUserId(userId: string): PasswordHashRecord | undefined;
  createUserSession(input: UserSessionRecord): UserSessionRecord;
  findUserSessionById(id: string): UserSessionRecord | undefined;
  createSessionFile(input: SessionFile): SessionFile;
  listSessionFiles(sessionId: string): SessionFile[];
  createResponse(input: ResponseRecord): ResponseRecord;
  findResponseById(id: string): ResponseRecord | undefined;
  updateResponseStatus(input: { id: string; status: ResponseStatus; updatedAt: string }): ResponseRecord | undefined;
}

/**
 * 创建开发阶段使用的进程内仓储。
 */
export function createMemoryDatabase(): MemoryDatabase {
  const usersById = new Map<string, User>();
  const userIdsByEmail = new Map<string, string>();
  const passwordHashesByUserId = new Map<string, PasswordHashRecord>();
  const sessionsById = new Map<string, UserSessionRecord>();
  const filesBySessionId = new Map<string, SessionFile[]>();
  const responsesById = new Map<string, ResponseRecord>();

  return {
    createUser(input) {
      const user: User = {
        id: input.id,
        email: input.email,
        workspacePath: input.workspacePath,
        createdAt: input.createdAt,
      };
      usersById.set(user.id, user);
      userIdsByEmail.set(user.email, user.id);
      return user;
    },

    findUserByEmail(email) {
      const userId = userIdsByEmail.get(email);
      return userId ? usersById.get(userId) : undefined;
    },

    findUserById(id) {
      return usersById.get(id);
    },

    setPasswordHash(input) {
      passwordHashesByUserId.set(input.userId, input);
    },

    getPasswordHashByUserId(userId) {
      return passwordHashesByUserId.get(userId);
    },

    createUserSession(input) {
      sessionsById.set(input.id, input);
      return input;
    },

    findUserSessionById(id) {
      return sessionsById.get(id);
    },

    createSessionFile(input) {
      const files = filesBySessionId.get(input.sessionId) ?? [];
      files.push(input);
      filesBySessionId.set(input.sessionId, files);
      return input;
    },

    listSessionFiles(sessionId) {
      return filesBySessionId.get(sessionId) ?? [];
    },

    createResponse(input) {
      responsesById.set(input.id, input);
      return input;
    },

    findResponseById(id) {
      return responsesById.get(id);
    },

    updateResponseStatus(input) {
      const response = responsesById.get(input.id);
      if (!response) return undefined;
      const next = {
        ...response,
        status: input.status,
        updatedAt: input.updatedAt,
      };
      responsesById.set(input.id, next);
      return next;
    },
  };
}
