import type { ChatMessage, FileKind, SessionStatus, User } from "@opencode-ui/shared";

export interface ApiFile {
  id: string;
  name: string;
  kind: FileKind;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface ApiSession {
  id: string;
  title: string;
  status: SessionStatus;
  updatedAt: string;
  files: ApiFile[];
  messages: Array<Omit<ChatMessage, "files"> & { files: ApiFile[] }>;
}

export interface ApiClient {
  createSession(input: { title: string }): Promise<ApiSession>;
  listSessions(): Promise<ApiSession[]>;
  login(input: { email: string; password: string }): Promise<{ user: Pick<User, "email"> }>;
  logout(): Promise<void>;
  me(): Promise<{ user: Pick<User, "email"> } | null>;
  register(input: { email: string; password: string }): Promise<{ user: Pick<User, "email"> }>;
  sendMessage(
    sessionId: string,
    input: { fileIds: string[]; text: string },
  ): Promise<{ message: ApiSession["messages"][number]; session: ApiSession }>;
  uploadFile(sessionId: string, file: File): Promise<ApiFile>;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

export const browserApi: ApiClient = {
  async createSession(input) {
    const body = await request<{ session: ApiSession }>("/sessions", {
      body: input,
      method: "POST",
    });
    return body.session;
  },

  async listSessions() {
    const body = await request<{ sessions: ApiSession[] }>("/sessions");
    return body.sessions;
  },

  async login(input) {
    return await request("/auth/login", { body: input, method: "POST" });
  },

  async logout() {
    await request("/auth/logout", { method: "POST" });
  },

  async me() {
    try {
      return await request("/auth/me");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        return null;
      }
      throw error;
    }
  },

  async register(input) {
    return await request("/auth/register", { body: input, method: "POST" });
  },

  async sendMessage(sessionId, input) {
    return await request(`/sessions/${sessionId}/messages`, {
      body: input,
      method: "POST",
    });
  },

  async uploadFile(sessionId, file) {
    const body = await request<{ file: ApiFile }>(`/sessions/${sessionId}/files`, {
      body: {
        contentBase64: await fileToBase64(file),
        mimeType: file.type || "application/octet-stream",
        name: file.name,
      },
      method: "POST",
    });
    return body.file;
  },
};

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, options: { body?: unknown; method?: string } = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "include",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    method: options.method ?? "GET",
  });
  const body = await response.json();
  if (!response.ok) {
    throw new ApiRequestError(response.status, body.error ?? "API request failed.");
  }
  return body as T;
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
