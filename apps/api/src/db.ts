import type { ChatMessage, SessionFile, User, WorkspaceSession } from "@opencode-ui/shared";

export interface PasswordHashRecord {
  userId: string;
  passwordHash: string;
}

export interface UserSessionRecord {
  id: string;
  userId: string;
  createdAt: string;
}

export interface MemoryDatabase {
  createUser(input: { id: string; email: string; createdAt: string }): User;
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
