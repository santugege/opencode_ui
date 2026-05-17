import type { ChatMessage, FileKind, SessionStatus, User } from "@opencode-ui/shared";

export interface ApiFile {
  /** 后端分配的文件 ID。 */
  id: string;
  /** 浏览器上传时的原始文件名。 */
  name: string;
  /** 用于前端选择图标和展示样式的文件分类。 */
  kind: FileKind;
  /** 浏览器或后端推断出的 MIME 类型。 */
  mimeType: string;
  /** 文件大小，单位为字节。 */
  size: number;
  /** 文件写入工作区的 ISO 时间。 */
  createdAt: string;
}

export type ApiMessage = Omit<ChatMessage, "files"> & { files: ApiFile[] };

export interface ApiSession {
  /** opencode 会话 ID，也是路由资源标识。 */
  id: string;
  /** 左侧历史列表展示标题。 */
  title: string;
  /** 后端把 opencode 状态映射后的前端状态。 */
  status: SessionStatus;
  /** 最近更新时间的 ISO 字符串。 */
  updatedAt: string;
  /** 当前会话已上传文件的索引摘要。 */
  files: ApiFile[];
}

export interface ApiSessionDetail extends ApiSession {
  /** 仅在用户打开某个历史会话时才加载的完整消息列表。 */
  messages: ApiMessage[];
}

export interface ApiModelSelection {
  /** opencode provider id，保持 SDK 字段名。 */
  providerID: string;
  /** opencode model id，保持 SDK 字段名。 */
  modelID: string;
}

export interface ApiModelOption {
  id: string;
  object: "model";
  providerID: string;
  providerName: string;
  modelID: string;
  name: string;
  isDefault: boolean;
  contextWindow?: number;
  outputLimit?: number;
  supportsAttachments?: boolean;
  supportsReasoning?: boolean;
  supportsTools?: boolean;
}

export interface ApiModelProvider {
  id: string;
  name: string;
  defaultModelID?: string;
  models: ApiModelOption[];
}

export interface ApiModelCatalog {
  object: "list";
  data: ApiModelOption[];
  providers: ApiModelProvider[];
  default: Record<string, string>;
}

export interface ApiResponsePayload {
  id: string;
  status: "in_progress" | "completed" | "failed" | "cancelled";
  conversation?: { id: string };
  error?: { message?: string };
}

export interface ApiQuestionOption {
  label: string;
  description: string;
}

export interface ApiQuestionInfo {
  question: string;
  header: string;
  options: ApiQuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface ApiQuestionTool {
  messageID: string;
  callID: string;
}

export interface ApiQuestionRequest {
  id: string;
  sessionID: string;
  questions: ApiQuestionInfo[];
  tool?: ApiQuestionTool;
}

export type ApiQuestionAnswer = string[];

export type VideoTaskStatus = "queued" | "running" | "cancelled" | "succeeded" | "failed" | "expired";

export interface ApiVideoTask {
  id: string;
  model?: string;
  status: VideoTaskStatus;
  error?: Record<string, unknown> | null;
  content?: Record<string, unknown> | null;
  created_at?: number | string;
  updated_at?: number | string;
  usage?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ApiVideoTaskListFilters {
  model?: string;
  pageNum?: number;
  pageSize?: number;
  serviceTier?: string;
  status?: VideoTaskStatus;
  taskIds?: string[];
}

export interface ApiVideoTaskListResponse {
  items: ApiVideoTask[];
  total: number;
}

export interface ApiStreamEvent {
  data: unknown;
  event: string;
  id?: string;
  retry?: number;
}

export interface ApiStreamResponseInput {
  conversationId?: string;
  fileIds: string[];
  model?: ApiModelSelection;
  signal?: AbortSignal;
  text: string;
}

export interface ApiClient {
  /** 取消正在执行的 Responses 流。 */
  cancelResponse?: (responseId: string) => Promise<ApiResponsePayload>;
  /** 创建一个空 opencode 会话，返回不含消息详情的摘要。 */
  createSession(input: { title: string }): Promise<ApiSession>;
  /** 用户点击历史会话后读取该会话详情。 */
  getSession(sessionId: string): Promise<ApiSessionDetail>;
  /** 读取单个火山 Ark 视频生成任务详情。 */
  getVideoTask?: (taskId: string) => Promise<ApiVideoTask>;
  /** 读取当前用户工作区可用 opencode 模型。 */
  listModels?: () => Promise<ApiModelCatalog>;
  /** 读取当前工作区所有等待用户回答的 question tool 请求。 */
  listQuestions?: () => Promise<ApiQuestionRequest[]>;
  /** 读取左侧历史列表摘要，不包含消息详情。 */
  listSessions(): Promise<ApiSession[]>;
  /** 查询火山 Ark 最近 7 天视频生成任务。 */
  listVideoTasks?: (filters: ApiVideoTaskListFilters) => Promise<ApiVideoTaskListResponse>;
  /** 使用邮箱和密码登录。 */
  login(input: { email: string; password: string }): Promise<{ user: Pick<User, "email"> }>;
  /** 清除当前浏览器会话 cookie。 */
  logout(): Promise<void>;
  /** 获取当前浏览器会话绑定的用户，未登录时返回 null。 */
  me(): Promise<{ user: Pick<User, "email"> } | null>;
  /** 创建用户并立即建立浏览器会话。 */
  register(input: { email: string; password: string }): Promise<{ user: Pick<User, "email"> }>;
  /** 向指定 opencode 会话发送提示词和已上传文件引用。 */
  sendMessage(
    sessionId: string,
    input: { fileIds: string[]; text: string },
  ): Promise<{ message: ApiMessage; session: ApiSessionDetail }>;
  /** 使用 Responses 兼容接口发送消息，并逐帧接收 SSE 事件。 */
  streamResponse?: (
    input: ApiStreamResponseInput,
    handlers: { onEvent: (event: ApiStreamEvent) => void | Promise<void> },
  ) => Promise<ApiResponsePayload | undefined>;
  /** 回答 opencode question tool 请求。 */
  replyQuestion?: (requestId: string, answers: ApiQuestionAnswer[]) => Promise<void>;
  /** 拒绝 opencode question tool 请求。 */
  rejectQuestion?: (requestId: string) => Promise<void>;
  /** 取消排队任务或删除已结束任务。 */
  deleteVideoTask?: (taskId: string) => Promise<void>;
  /** 将浏览器文件上传到当前用户工作区，并通过会话 ID 建立归属关系。 */
  uploadFile(sessionId: string, file: File): Promise<ApiFile>;
}

const apiBaseUrl = readApiBaseUrl();

export const browserApi: ApiClient = {
  async cancelResponse(responseId) {
    return await request(`/v1/responses/${encodeURIComponent(responseId)}/cancel`, { method: "POST" });
  },

  async createSession(input) {
    const body = await request<{ session: ApiSession }>("/sessions", {
      body: input,
      method: "POST",
    });
    return body.session;
  },

  async getSession(sessionId) {
    const body = await request<{ session: ApiSessionDetail }>(`/sessions/${sessionId}`);
    return body.session;
  },

  async getVideoTask(taskId) {
    const body = await request<{ task: ApiVideoTask }>(`/video-tasks/${encodeURIComponent(taskId)}`);
    return body.task;
  },

  async listSessions() {
    const body = await request<{ sessions: ApiSession[] }>("/sessions");
    return body.sessions;
  },

  async listVideoTasks(filters) {
    return await request<ApiVideoTaskListResponse>(`/video-tasks${videoTaskQuery(filters)}`);
  },

  async listModels() {
    return await request<ApiModelCatalog>("/v1/models");
  },

  async listQuestions() {
    const body = await request<{ questions: ApiQuestionRequest[] }>("/questions");
    return body.questions;
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

  async streamResponse(input, handlers) {
    return await streamRequest(
      "/v1/responses",
      {
        ...(input.conversationId ? { conversation: { id: input.conversationId } } : {}),
        input: [
          {
            content: [
              { text: input.text, type: "input_text" },
              ...input.fileIds.map((fileId) => ({ file_id: fileId, type: "input_file" })),
            ],
            role: "user",
            type: "message",
          },
        ],
        model: input.model,
        stream: true,
      },
      input.signal,
      handlers,
    );
  },

  async replyQuestion(requestId, answers) {
    await request(`/questions/${encodeURIComponent(requestId)}/reply`, {
      body: { answers },
      method: "POST",
    });
  },

  async rejectQuestion(requestId) {
    await request(`/questions/${encodeURIComponent(requestId)}/reject`, { method: "POST" });
  },

  async deleteVideoTask(taskId) {
    await request(`/video-tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
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
  // 所有浏览器请求都携带 cookie，后端通过 HTTP-only session cookie 识别用户。
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

function videoTaskQuery(filters: ApiVideoTaskListFilters) {
  const params = new URLSearchParams();
  if (filters.pageNum !== undefined) params.set("page_num", String(filters.pageNum));
  if (filters.pageSize !== undefined) params.set("page_size", String(filters.pageSize));
  if (filters.status) params.set("status", filters.status);
  if (filters.model?.trim()) params.set("model", filters.model.trim());
  if (filters.serviceTier?.trim()) params.set("service_tier", filters.serviceTier.trim());
  for (const taskId of filters.taskIds ?? []) {
    if (taskId.trim()) params.append("task_ids", taskId.trim());
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function streamRequest(
  path: string,
  body: unknown,
  signal: AbortSignal | undefined,
  handlers: { onEvent: (event: ApiStreamEvent) => void | Promise<void> },
) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: JSON.stringify(body),
    credentials: "include",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "API request failed." }));
    throw new ApiRequestError(response.status, body.error ?? "API request failed.");
  }
  if (!response.body) {
    throw new ApiRequestError(response.status, "Streaming response did not include a body.");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let finalResponse: ApiResponsePayload | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = parseSseFrame(frame);
      if (!event) continue;
      await handlers.onEvent(event);
      if (event.event.startsWith("response.") && isResponsePayload(event.data)) {
        finalResponse = event.data;
      }
    }
  }

  const remaining = parseSseFrame(buffer);
  if (remaining) {
    await handlers.onEvent(remaining);
    if (remaining.event.startsWith("response.") && isResponsePayload(remaining.data)) {
      finalResponse = remaining.data;
    }
  }

  return finalResponse;
}

function parseSseFrame(frame: string): ApiStreamEvent | undefined {
  // 后端会同时发送命名 response 事件和 opencode 原始 message 事件，这里保留 SSE 原始字段。
  const lines = frame.split("\n");
  const dataLines: string[] = [];
  let event = "message";
  let id: string | undefined;
  let retry: number | undefined;

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.replace(/^event:\s?/, "");
    } else if (line.startsWith("id:")) {
      id = line.replace(/^id:\s?/, "");
    } else if (line.startsWith("retry:")) {
      const parsed = Number(line.replace(/^retry:\s?/, ""));
      if (Number.isFinite(parsed)) retry = parsed;
    } else if (line.startsWith("data:")) {
      dataLines.push(line.replace(/^data:\s?/, ""));
    }
  }

  if (dataLines.length === 0) return undefined;
  const rawData = dataLines.join("\n");
  let data: unknown = rawData;
  try {
    data = JSON.parse(rawData);
  } catch {
    data = rawData;
  }
  return { data, event, id, retry };
}

function isResponsePayload(value: unknown): value is ApiResponsePayload {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
}

function readApiBaseUrl() {
  const port = Number(import.meta.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
