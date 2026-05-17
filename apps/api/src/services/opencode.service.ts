import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { createOpencodeClient as createOpencodeV2Client } from "@opencode-ai/sdk/v2/client";
import type {
  CreateOpencodeClient,
  OpencodeMessageData,
  OpencodeApiError,
  OpencodeEventStream,
  OpencodeModelCatalogData,
  OpencodeModelSelection,
  OpencodeQuestionAnswer,
  OpencodeQuestionRequest,
  OpencodeSdkClient,
  OpencodeSessionData,
  OpencodeSessionStatusData,
  PromptAttachmentInput,
} from "../types/opencode";

/**
 * opencode 集成模式。
 */
export type OpencodeMode = "live" | "stub";

/**
 * opencode 服务需要的依赖。
 */
export interface OpencodeServiceOptions {
  /** 正在运行的 opencode 服务基础 URL。 */
  baseUrl: string;
  /** SDK 工厂，便于隔离调用方进行注入。 */
  createClient?: CreateOpencodeClient;
}

/**
 * 所有面向用户工作区的 opencode 操作共享的入参。
 */
export interface OpencodeWorkspaceInput {
  /** 用户工作区路径，允许相对当前项目根目录。 */
  workspacePath: string;
}

/**
 * 创建 opencode 会话的入参。
 */
export interface CreateOpencodeSessionInput extends OpencodeWorkspaceInput {
  /** 展示在 opencode 中的初始标题。 */
  title: string;
}

/**
 * 发送提示词到 opencode 的入参。
 */
export interface SendPromptInput extends OpencodeWorkspaceInput {
  /** 附加到提示词的文件。 */
  files: PromptAttachmentInput[];
  /** 可选 opencode 模型选择，保持 SDK 原生字段名。 */
  model?: OpencodeModelSelection;
  /** opencode 会话 ID。 */
  sessionId: string;
  /** 可选系统指令，对应 Responses API 的 instructions。 */
  system?: string;
  /** 用户提示词文本。 */
  text: string;
}

/**
 * 读取单个 opencode 会话消息的入参。
 */
export interface ListOpencodeMessagesInput extends OpencodeWorkspaceInput {
  /** opencode 会话标识。 */
  sessionId: string;
}

/**
 * 取消 opencode 会话执行的入参。
 */
export interface AbortOpencodeSessionInput extends OpencodeWorkspaceInput {
  /** opencode 会话标识。 */
  sessionId: string;
}

/**
 * 回答 opencode question 请求的入参。
 */
export interface ReplyOpencodeQuestionInput extends OpencodeWorkspaceInput {
  /** opencode question request ID。 */
  requestId: string;
  /** 按 questions 顺序排列的答案数组。 */
  answers: OpencodeQuestionAnswer[];
}

/**
 * 拒绝 opencode question 请求的入参。
 */
export interface RejectOpencodeQuestionInput extends OpencodeWorkspaceInput {
  /** opencode question request ID。 */
  requestId: string;
}

/**
 * 测试和桩实现可注入的 opencode 会话创建函数。
 */
export type CreateOpencodeSessionFn = (input: CreateOpencodeSessionInput & { baseUrl: string }) => Promise<OpencodeSessionData>;

/**
 * 测试和桩实现可注入的 opencode 提示词发送函数。
 */
export type SendPromptFn = (input: SendPromptInput & { baseUrl: string }) => Promise<OpencodeMessageData>;

/**
 * 用于选择真实 SDK、桩实现或注入调用的运行时配置。
 */
export interface OpencodeGatewayOptions {
  /** 正在运行的 opencode 服务基础 URL。 */
  baseUrl: string;
  /** 集成模式，浏览器端到端场景使用 stub 模式。 */
  mode: OpencodeMode;
  /** 可选的会话创建注入实现。 */
  createOpencodeSession?: CreateOpencodeSessionFn;
  /** 可选的提示词发送注入实现。 */
  sendPrompt?: SendPromptFn;
}

/**
 * 面向应用层的 opencode 网关。live 实现持有唯一 SDK client，
 * 并在每次请求中通过 `query.directory` 隔离工作区。
 */
export interface OpencodeGateway {
  /** 按工作区读取当前可用 provider 和模型列表。 */
  listModels(input: OpencodeWorkspaceInput): Promise<OpencodeModelCatalogData>;
  /** 按工作区读取所有等待用户回答的 question tool 请求。 */
  listQuestions(input: OpencodeWorkspaceInput): Promise<OpencodeQuestionRequest[]>;
  /** 回答指定 question tool 请求。 */
  replyQuestion(input: ReplyOpencodeQuestionInput): Promise<boolean>;
  /** 拒绝指定 question tool 请求。 */
  rejectQuestion(input: RejectOpencodeQuestionInput): Promise<boolean>;
  /** 按工作区列出 opencode 会话摘要。 */
  listSessions(input: OpencodeWorkspaceInput): Promise<OpencodeSessionData[]>;
  /** 按工作区读取所有会话运行状态。 */
  listSessionStatuses(input: OpencodeWorkspaceInput): Promise<Record<string, OpencodeSessionStatusData>>;
  /** 读取指定 opencode 会话的消息详情。 */
  listMessages(input: ListOpencodeMessagesInput): Promise<OpencodeMessageData[]>;
  /** 在指定工作区创建新的 opencode 会话。 */
  createSession(input: CreateOpencodeSessionInput): Promise<OpencodeSessionData>;
  /** 向指定 opencode 会话发送文本和文件 part。 */
  sendPrompt(input: SendPromptInput): Promise<OpencodeMessageData>;
  /** 异步启动 opencode 提示词执行，响应内容通过事件流返回。 */
  sendPromptAsync(input: SendPromptInput): Promise<void>;
  /** 中断指定 opencode 会话当前执行。 */
  abortSession(input: AbortOpencodeSessionInput): Promise<boolean>;
  /** 订阅当前工作区的 opencode 原始 SSE 事件流。 */
  subscribeEvents(input: OpencodeWorkspaceInput): Promise<OpencodeEventStream>;
}

const defaultCreateClient = createOpencodeClient as CreateOpencodeClient;
const DEFAULT_SESSION_TITLE = "未命名会话";

function resolveWorkspaceDirectory(workspacePath: string) {
  return resolve(process.cwd(), workspacePath);
}

/**
 * 创建 live 模式 opencode 服务，并且只构造一个 SDK client 实例。
 */
export function createOpencodeService(options: OpencodeServiceOptions): OpencodeGateway {
  const client = (options.createClient ?? defaultCreateClient)({
    baseUrl: options.baseUrl,
    throwOnError: true,
  });

  return createOpencodeGatewayFromClient(client, options.baseUrl);
}

/**
 * 将已创建的 SDK client 适配为 API 内部的 opencode 网关契约。
 */
export function createOpencodeGatewayFromClient(client: OpencodeSdkClient, eventBaseUrl?: string): OpencodeGateway {
  const questionClient = eventBaseUrl
    ? createOpencodeV2Client({ baseUrl: eventBaseUrl, throwOnError: true })
    : undefined;

  return {
    async listModels(input) {
      try {
        if (!client.config?.providers) throw new Error("Opencode client does not expose config.providers.");
        const result = await client.config.providers({
          query: { directory: resolveWorkspaceDirectory(input.workspacePath) },
        });
        return result.data;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async listQuestions(input) {
      try {
        if (!questionClient) throw new Error("Opencode question client is not configured.");
        const result = await questionClient.question.list({
          directory: resolveWorkspaceDirectory(input.workspacePath),
        });
        return result.data ?? [];
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async replyQuestion(input) {
      try {
        if (!questionClient) throw new Error("Opencode question client is not configured.");
        const result = await questionClient.question.reply({
          answers: input.answers,
          directory: resolveWorkspaceDirectory(input.workspacePath),
          requestID: input.requestId,
        });
        if (result.data !== true) throw new Error("Opencode question reply was not accepted.");
        return true;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async rejectQuestion(input) {
      try {
        if (!questionClient) throw new Error("Opencode question client is not configured.");
        const result = await questionClient.question.reject({
          directory: resolveWorkspaceDirectory(input.workspacePath),
          requestID: input.requestId,
        });
        if (result.data !== true) throw new Error("Opencode question reject was not accepted.");
        return true;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async subscribeEvents(input) {
      if (!eventBaseUrl) {
        throw mapOpencodeError({
          status: 500,
          message: "Opencode event stream base URL is not configured.",
        });
      }
      return await openOpencodeEventStream(eventBaseUrl, input.workspacePath);
    },

    async abortSession(input) {
      try {
        if (!client.session.abort) throw new Error("Opencode client does not expose session.abort.");
        const result = await client.session.abort({
          path: { id: input.sessionId },
          query: { directory: resolveWorkspaceDirectory(input.workspacePath) },
        });
        return result.data;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async listSessions(input) {
      try {
        if (!client.session.list) throw new Error("Opencode client does not expose session.list.");
        const result = await client.session.list({
          query: { directory: resolveWorkspaceDirectory(input.workspacePath) },
        });
        return result.data;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async listSessionStatuses(input) {
      try {
        if (!client.session.status) throw new Error("Opencode client does not expose session.status.");
        const result = await client.session.status({
          query: { directory: resolveWorkspaceDirectory(input.workspacePath) },
        });
        return result.data;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async listMessages(input) {
      try {
        if (!client.session.messages) throw new Error("Opencode client does not expose session.messages.");
        const result = await client.session.messages({
          path: { id: input.sessionId },
          query: { directory: resolveWorkspaceDirectory(input.workspacePath) },
        });
        return result.data;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async createSession(input) {
      try {
        if (!client.session.create) throw new Error("Opencode client does not expose session.create.");
        const result = await client.session.create({
          body: { title: input.title },
          query: { directory: resolveWorkspaceDirectory(input.workspacePath) },
        });
        return result.data;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async sendPrompt(input) {
      try {
        if (!client.session.prompt) throw new Error("Opencode client does not expose session.prompt.");
        const result = await client.session.prompt({
          path: { id: input.sessionId },
          query: { directory: resolveWorkspaceDirectory(input.workspacePath) },
          body: toPromptBody(input),
        });
        return result.data;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async sendPromptAsync(input) {
      try {
        if (!client.session.promptAsync) throw new Error("Opencode client does not expose session.promptAsync.");
        await client.session.promptAsync({
          path: { id: input.sessionId },
          query: { directory: resolveWorkspaceDirectory(input.workspacePath) },
          body: toPromptBody(input),
        });
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },
  };
}

/**
 * 根据应用配置创建对应的 opencode 网关。
 */
export function createConfiguredOpencodeGateway(options: OpencodeGatewayOptions): OpencodeGateway {
  if (options.mode === "stub") {
    return createStubOpencodeGateway(options.baseUrl);
  }

  if (!options.createOpencodeSession && !options.sendPrompt) {
    return createOpencodeService({ baseUrl: options.baseUrl });
  }

  // 注入 create/send 实现时，列表、状态和详情仍由同一份内存状态承接。
  const injectedGateway = createStubOpencodeGateway(options.baseUrl);

  return {
    listModels(input) {
      return injectedGateway.listModels(input);
    },
    listQuestions(input) {
      return injectedGateway.listQuestions(input);
    },
    replyQuestion(input) {
      return injectedGateway.replyQuestion(input);
    },
    rejectQuestion(input) {
      return injectedGateway.rejectQuestion(input);
    },
    listSessions(input) {
      return injectedGateway.listSessions(input);
    },
    listSessionStatuses(input) {
      return injectedGateway.listSessionStatuses(input);
    },
    listMessages(input) {
      return injectedGateway.listMessages(input);
    },
    createSession(input) {
      if (options.createOpencodeSession) {
        return options
          .createOpencodeSession({ ...input, baseUrl: options.baseUrl })
          .then((createdSession) => {
            injectedGateway.upsertSession(createdSession);
            return createdSession;
          });
      }
      return injectedGateway.createSession(input);
    },
    sendPrompt(input) {
      if (options.sendPrompt) {
        return options
          .sendPrompt({ ...input, baseUrl: options.baseUrl })
          .then((createdMessage) => {
            injectedGateway.appendMessage(input.sessionId, createdMessage, input.text);
            return createdMessage;
          });
      }
      return injectedGateway.sendPrompt(input);
    },
    sendPromptAsync(input) {
      if (options.sendPrompt) {
        return options
          .sendPrompt({ ...input, baseUrl: options.baseUrl })
          .then((createdMessage) => {
            injectedGateway.appendMessage(input.sessionId, createdMessage, input.text);
          });
      }
      return injectedGateway.sendPromptAsync(input);
    },
    subscribeEvents(input) {
      return injectedGateway.subscribeEvents(input);
    },
    abortSession(input) {
      return injectedGateway.abortSession(input);
    },
  };
}

/**
 * 直接代理 opencode 的 `/event` SSE 字节流，避免在 API 层丢失上游事件字段。
 */
async function openOpencodeEventStream(baseUrl: string, workspacePath: string): Promise<OpencodeEventStream> {
  const controller = new AbortController();
  const url = new URL("/event", baseUrl);
  url.searchParams.set("directory", resolveWorkspaceDirectory(workspacePath));

  try {
    const response = await fetch(url, {
      headers: { accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (!response.ok) {
      controller.abort();
      throw mapOpencodeError({
        status: response.status,
        message: `Opencode event stream failed: ${response.status} ${response.statusText}`,
      });
    }
    if (!response.body) {
      controller.abort();
      throw mapOpencodeError({
        status: 502,
        message: "Opencode event stream did not include a response body.",
      });
    }

    return {
      body: response.body,
      close() {
        controller.abort();
      },
    };
  } catch (error) {
    controller.abort();
    if (isOpencodeApiError(error)) throw error;
    throw mapOpencodeError(error);
  }
}

/**
 * 将浏览器文本和附件引用转换为 opencode prompt part，供阻塞和异步接口共用。
 */
function toPromptParts(input: SendPromptInput) {
  return [
    ...input.files.map((file) => ({
      type: "file" as const,
      mime: file.mimeType,
      filename: file.filename,
      url: pathToFileURL(file.absolutePath).href,
    })),
    { type: "text" as const, text: input.text },
  ];
}

/**
 * prompt 和 prompt_async 共享同一份请求体，避免模型和 system 映射出现分叉。
 */
function toPromptBody(input: SendPromptInput) {
  return {
    model: input.model,
    parts: toPromptParts(input),
    system: input.system,
  };
}

/**
 * 将 SDK 和传输层失败映射为 API 明确的 opencode 错误结构。
 */
export function mapOpencodeError(error: unknown): OpencodeApiError {
  const status = extractStatus(error) ?? 502;
  const message = extractMessage(error) ?? "Opencode request failed.";

  return {
    status,
    message,
    retryable: status === 408 || status === 409 || status === 425 || status === 429 || status >= 500,
  };
}

/**
 * Fastify 错误处理器使用的类型保护。
 */
export function isOpencodeApiError(error: unknown): error is OpencodeApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    "retryable" in error &&
    typeof error.status === "number" &&
    typeof error.message === "string" &&
    typeof error.retryable === "boolean"
  );
}

function extractStatus(error: unknown) {
  // SDK HTTP 错误和底层 cause 都可能携带状态码，优先保留上游状态。
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }

  if (typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }

  if (error instanceof Error && typeof error.cause === "object" && error.cause !== null) {
    const cause = error.cause as { status?: unknown };
    if (typeof cause.status === "number") return cause.status;
  }

  return undefined;
}

function extractMessage(error: unknown) {
  // 透传上游错误消息，方便启动期和请求期快速定位 opencode 连接问题。
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return undefined;
}

const stubCreateOpencodeSession: CreateOpencodeSessionFn = async (input) => ({
  id: `stub-opencode-${randomUUID()}`,
  title: input.title,
  time: {
    created: Date.now(),
    updated: Date.now(),
  },
});

const stubSendPrompt: SendPromptFn = async (input) => ({
  info: {
    id: `stub-message-${randomUUID()}`,
    role: "user",
    sessionID: input.sessionId,
    time: {
      created: Date.now(),
    },
  },
  parts: [
    ...input.files.map((file) => ({
      type: "file" as const,
      mime: file.mimeType,
      filename: file.filename,
      url: pathToFileURL(file.absolutePath).href,
    })),
    { type: "text", text: input.text },
  ],
});

type MutableOpencodeGateway = OpencodeGateway & {
  /** 将外部注入创建出的会话同步到内存网关，供列表和详情端点读取。 */
  upsertSession(session: OpencodeSessionData): void;
  /** 将外部注入返回的消息同步到内存网关，保持测试和桩模式的历史一致。 */
  appendMessage(sessionId: string, message: OpencodeMessageData, text: string): void;
};

function createStubOpencodeGateway(baseUrl: string): MutableOpencodeGateway {
  // 浏览器 e2e 和注入式测试共用这一份内存状态，保持列表、详情、发送结果一致。
  const sessions = new Map<string, OpencodeSessionData>();
  const messages = new Map<string, OpencodeMessageData[]>();
  const questions = new Map<string, OpencodeQuestionRequest>();
  const events = createStubEventPublisher();

  async function appendPrompt(input: SendPromptInput) {
    const message = await stubSendPrompt({ ...input, baseUrl });
    const sessionMessages = messages.get(input.sessionId) ?? [];
    messages.set(input.sessionId, [...sessionMessages, message]);
    const session = sessions.get(input.sessionId);
    if (session) {
      const updatedSession = {
        ...session,
        title: nextSessionTitle(session.title, input.text),
        time: {
          created: session.time?.created ?? Date.now(),
          updated: Date.now(),
        },
      };
      sessions.set(input.sessionId, updatedSession);
      events.publish({ type: "message.updated", properties: { info: message.info } });
      events.publish({ type: "session.updated", properties: { info: updatedSession } });
    }
    events.publish({ type: "session.idle", properties: { sessionID: input.sessionId } });
    return message;
  }

  return {
    async listModels() {
      return { default: {}, providers: [] };
    },
    async listSessions() {
      return Array.from(sessions.values()).sort((left, right) => (right.time?.updated ?? 0) - (left.time?.updated ?? 0));
    },
    async listSessionStatuses() {
      return Object.fromEntries(Array.from(sessions.keys()).map((id) => [id, { type: "idle" as const }]));
    },
    async listMessages(input) {
      return messages.get(input.sessionId) ?? [];
    },
    async listQuestions() {
      return Array.from(questions.values());
    },
    async replyQuestion(input) {
      questions.delete(input.requestId);
      return true;
    },
    async rejectQuestion(input) {
      questions.delete(input.requestId);
      return true;
    },
    async abortSession() {
      return true;
    },
    async subscribeEvents() {
      return events.subscribe();
    },
    createSession(input) {
      const session = stubCreateOpencodeSession({ ...input, baseUrl });
      return session.then((created) => {
        sessions.set(created.id, created);
        messages.set(created.id, []);
        return created;
      });
    },
    async sendPrompt(input) {
      return await appendPrompt(input);
    },
    async sendPromptAsync(input) {
      await appendPrompt(input);
    },
    upsertSession(session: OpencodeSessionData) {
      sessions.set(session.id, session);
      messages.set(session.id, messages.get(session.id) ?? []);
    },
    appendMessage(sessionId: string, message: OpencodeMessageData, text: string) {
      const sessionMessages = messages.get(sessionId) ?? [];
      messages.set(sessionId, [...sessionMessages, message]);
      const session = sessions.get(sessionId);
      if (session) {
        sessions.set(sessionId, {
          ...session,
          title: nextSessionTitle(session.title, text),
          time: {
            created: session.time?.created ?? Date.now(),
            updated: Date.now(),
          },
        });
      }
    },
  };
}

/**
 * stub 模式没有真实 opencode HTTP 事件源；这里提供可关闭的空 SSE 流以保持路由契约稳定。
 */
function createStubEventPublisher() {
  const encoder = new TextEncoder();
  const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();

  return {
    publish(event: unknown) {
      const frame = `data: ${JSON.stringify(event)}\n\n`;
      for (const subscriber of subscribers) {
        try {
          subscriber.enqueue(encoder.encode(frame));
        } catch {
          subscribers.delete(subscriber);
        }
      }
    },
    subscribe(): OpencodeEventStream {
      return createStubEventStream(subscribers, encoder);
    },
  };
}

function createStubEventStream(
  subscribers: Set<ReadableStreamDefaultController<Uint8Array>>,
  encoder: TextEncoder,
): OpencodeEventStream {
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closeController: (() => void) | undefined;
  let current: ReadableStreamDefaultController<Uint8Array> | undefined;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      current = controller;
      subscribers.add(controller);
      controller.enqueue(encoder.encode(": stub opencode event stream\n\n"));
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 15_000);
      closeController = () => {
        if (heartbeat) clearInterval(heartbeat);
        subscribers.delete(controller);
        try {
          controller.close();
        } catch {
          // 流可能已经被浏览器侧断开并取消。
        }
      };
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (current) subscribers.delete(current);
    },
  });

  return {
    body,
    close() {
      closeController?.();
    },
  };
}

function nextSessionTitle(currentTitle: string, promptText: string) {
  // 桩模式模拟 opencode 的标题提升：默认空标题会在首条消息后变成用户提示。
  return currentTitle.trim() && currentTitle !== DEFAULT_SESSION_TITLE ? currentTitle : promptText;
}
