import type { ChatMessage, SessionFile, User, WorkspaceSession } from "@opencode-ui/shared";

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

/**
 * 服务层使用的仓储契约。当前实现为内存存储，路由只依赖该接口，
 * 未来替换为持久化存储时不需要修改 HTTP 处理器。
 */
export interface MemoryDatabase {
  createUser(input: { createdAt: string; email: string; id: string }): User;
  findUserByEmail(email: string): User | undefined;
  findUserById(id: string): User | undefined;
  setPasswordHash(input: PasswordHashRecord): void;
  getPasswordHashByUserId(userId: string): PasswordHashRecord | undefined;
  createUserSession(input: UserSessionRecord): UserSessionRecord;
  findUserSessionById(id: string): UserSessionRecord | undefined;
  createWorkspaceSession(input: WorkspaceSession): WorkspaceSession;
  updateWorkspaceSession(input: WorkspaceSession): WorkspaceSession;
  findWorkspaceSessionById(id: string): WorkspaceSession | undefined;
  listWorkspaceSessionsByUserId(userId: string): WorkspaceSession[];
  createSessionFile(input: SessionFile): SessionFile;
  listSessionFiles(sessionId: string): SessionFile[];
  createChatMessage(input: ChatMessage): ChatMessage;
  listChatMessages(sessionId: string): ChatMessage[];
}

/**
 * 创建开发阶段使用的进程内仓储。
 */
export function createMemoryDatabase(): MemoryDatabase {
  const usersById = new Map<string, User>();
  const userIdsByEmail = new Map<string, string>();
  const passwordHashesByUserId = new Map<string, PasswordHashRecord>();
  const sessionsById = new Map<string, UserSessionRecord>();
  const workspaceSessionsById = new Map<string, WorkspaceSession>();
  const filesBySessionId = new Map<string, SessionFile[]>();
  const messagesBySessionId = new Map<string, ChatMessage[]>();

  return {
    createUser(input) {
      const user: User = {
        id: input.id,
        email: input.email,
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

    createWorkspaceSession(input) {
      workspaceSessionsById.set(input.id, input);
      return input;
    },

    updateWorkspaceSession(input) {
      workspaceSessionsById.set(input.id, input);
      return input;
    },

    findWorkspaceSessionById(id) {
      return workspaceSessionsById.get(id);
    },

    listWorkspaceSessionsByUserId(userId) {
      return Array.from(workspaceSessionsById.values()).filter((session) => session.userId === userId);
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

    createChatMessage(input) {
      const messages = messagesBySessionId.get(input.sessionId) ?? [];
      messages.push(input);
      messagesBySessionId.set(input.sessionId, messages);
      return input;
    },

    listChatMessages(sessionId) {
      return messagesBySessionId.get(sessionId) ?? [];
    },
  };
}
