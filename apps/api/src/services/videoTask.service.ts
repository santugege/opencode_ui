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

export interface ApiVideoTaskListResponse {
  items: ApiVideoTask[];
  total: number;
}

export interface VideoTaskListInput {
  model?: string;
  pageNum: number;
  pageSize: number;
  serviceTier?: string;
  status?: VideoTaskStatus;
  taskIds: string[];
}

export interface VideoTaskServiceOptions {
  /** 服务端持有的 Ark API Key，不向浏览器暴露。 */
  apiKey?: string;
  /** Ark API 基础地址，默认由运行时配置提供。 */
  baseUrl: string;
  /** 注入 fetch 便于后续隔离上游调用。 */
  fetchJson?: typeof fetch;
}

export interface VideoTaskService {
  deleteTask(taskId: string): Promise<void>;
  getTask(taskId: string): Promise<ApiVideoTask>;
  listTasks(input: VideoTaskListInput): Promise<ApiVideoTaskListResponse>;
}

export class VideoTaskServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "VideoTaskServiceError";
  }
}

const TASKS_PATH = "/contents/generations/tasks";

export function createVideoTaskService(options: VideoTaskServiceOptions): VideoTaskService {
  const fetchJson = options.fetchJson ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl);

  async function fetchTask(taskId: string) {
    const url = new URL(`${baseUrl}${TASKS_PATH}/${encodeURIComponent(taskId)}`);
    return parseTask(await requestArkJson(fetchJson, url, options.apiKey), taskId);
  }

  return {
    async listTasks(input) {
      const url = new URL(`${baseUrl}${TASKS_PATH}`);
      url.searchParams.set("page_num", String(input.pageNum));
      url.searchParams.set("page_size", String(input.pageSize));
      if (input.status) url.searchParams.set("filter.status", input.status);
      if (input.model) url.searchParams.set("filter.model", input.model);
      if (input.serviceTier) url.searchParams.set("filter.service_tier", input.serviceTier);
      for (const taskId of input.taskIds) {
        url.searchParams.append("filter.task_ids", taskId);
      }

      return parseTaskList(await requestArkJson(fetchJson, url, options.apiKey), input.taskIds);
    },

    async getTask(taskId) {
      return await fetchTask(taskId);
    },

    async deleteTask(taskId) {
      const url = new URL(`${baseUrl}${TASKS_PATH}/${encodeURIComponent(taskId)}`);
      await requestArkJson(fetchJson, url, options.apiKey, { method: "DELETE" });
    },
  };
}

async function requestArkJson(fetchJson: typeof fetch, url: URL, apiKey: string | undefined, init: RequestInit = {}) {
  const token = apiKey?.trim();
  if (!token) {
    throw new VideoTaskServiceError(503, "ARK_API_KEY is not configured on the API server.");
  }

  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetchJson(url, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new VideoTaskServiceError(502, error instanceof Error ? error.message : "Ark video task request failed.");
  }

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw new VideoTaskServiceError(response.status, errorMessageFromBody(body) ?? `Ark video task request failed: ${response.status}`);
  }
  return body;
}

async function readJsonBody(response: Response) {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new VideoTaskServiceError(502, "Ark video task response was not valid JSON.");
  }
}

function parseTaskList(value: unknown, requestedTaskIds: string[]): ApiVideoTaskListResponse {
  const body = requireObject(value, "Ark video task list response must be a JSON object.");
  const items = body.items;
  if (!Array.isArray(items)) {
    throw new VideoTaskServiceError(502, "Ark video task list response did not include items.");
  }
  const total = body.total;
  if (typeof total !== "number" || !Number.isFinite(total)) {
    throw new VideoTaskServiceError(502, "Ark video task list response did not include total.");
  }

  return {
    items: items.map((item, index) => parseTask(item, requestedTaskIds.length === items.length ? requestedTaskIds[index] : undefined)),
    total,
  };
}

function parseTask(value: unknown, fallbackId?: string): ApiVideoTask {
  const task = requireObject(value, "Ark video task response must be a JSON object.");
  const id = stringField(task, "id") ?? fallbackId;
  if (!id) throw new VideoTaskServiceError(502, "Ark video task response did not include id.");

  const status = stringField(task, "status");
  if (!isVideoTaskStatus(status)) {
    throw new VideoTaskServiceError(502, "Ark video task response included an unsupported status.");
  }

  return { ...task, id, status };
}

function requireObject(value: unknown, message: string) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new VideoTaskServiceError(502, message);
}

function stringField(value: Record<string, unknown>, field: string) {
  const candidate = value[field];
  return typeof candidate === "string" ? candidate : undefined;
}

function errorMessageFromBody(value: unknown) {
  const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
  if (!body) return undefined;

  const error = typeof body.error === "object" && body.error !== null ? (body.error as Record<string, unknown>) : undefined;
  const directMessage = stringField(body, "message");
  const errorMessage = error ? stringField(error, "message") : undefined;
  const errorCode = error ? stringField(error, "code") : undefined;
  return errorCode && errorMessage ? `${errorCode}: ${errorMessage}` : errorMessage ?? directMessage;
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new VideoTaskServiceError(500, "ARK_BASE_URL must not be empty.");
  return trimmed.replace(/\/+$/, "");
}

function isVideoTaskStatus(value: unknown): value is VideoTaskStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "cancelled" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "expired"
  );
}
