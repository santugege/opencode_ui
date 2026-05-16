import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createOpencodeClient } from "@opencode-ai/sdk";
import type {
  CreateOpencodeClient,
  OpencodeApiError,
  OpencodeSdkClient,
  OpencodeSessionData,
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
  /** 用户/会话工作区绝对路径。 */
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
  /** 绑定到应用会话的 opencode 会话 ID。 */
  opencodeSessionId: string;
  /** 用户提示词文本。 */
  text: string;
}

/**
 * 测试和桩实现可注入的 opencode 会话创建函数。
 */
export type CreateOpencodeSessionFn = (input: CreateOpencodeSessionInput & { baseUrl: string }) => Promise<OpencodeSessionData>;

/**
 * 测试和桩实现可注入的 opencode 提示词发送函数。
 */
export type SendPromptFn = (input: SendPromptInput & { baseUrl: string }) => Promise<unknown>;

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
  createSession(input: CreateOpencodeSessionInput): Promise<OpencodeSessionData>;
  sendPrompt(input: SendPromptInput): Promise<unknown>;
}

const defaultCreateClient = createOpencodeClient as CreateOpencodeClient;

/**
 * 创建 live 模式 opencode 服务，并且只构造一个 SDK client 实例。
 */
export function createOpencodeService(options: OpencodeServiceOptions): OpencodeGateway {
  const client = (options.createClient ?? defaultCreateClient)({
    baseUrl: options.baseUrl,
    throwOnError: true,
  });

  return createOpencodeGatewayFromClient(client);
}

/**
 * 将已创建的 SDK client 适配为 API 内部的 opencode 网关契约。
 */
export function createOpencodeGatewayFromClient(client: OpencodeSdkClient): OpencodeGateway {
  return {
    async createSession(input) {
      try {
        if (!client.session.create) throw new Error("Opencode client does not expose session.create.");
        const result = await client.session.create({
          body: { title: input.title },
          query: { directory: input.workspacePath },
        });
        return result.data;
      } catch (error) {
        throw mapOpencodeError(error);
      }
    },

    async sendPrompt(input) {
      try {
        if (!client.session.prompt) throw new Error("Opencode client does not expose session.prompt.");
        return await client.session.prompt({
          path: { id: input.opencodeSessionId },
          query: { directory: input.workspacePath },
          body: {
            parts: [
              ...input.files.map((file) => ({
                type: "file" as const,
                mime: file.mimeType,
                filename: file.filename,
                url: pathToFileURL(file.absolutePath).href,
              })),
              { type: "text" as const, text: input.text },
            ],
          },
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
  const fallback =
    options.createOpencodeSession && options.sendPrompt
      ? undefined
      : options.mode === "stub"
        ? createStubOpencodeGateway(options.baseUrl)
        : createOpencodeService({ baseUrl: options.baseUrl });

  return {
    createSession(input) {
      if (options.createOpencodeSession) {
        return options.createOpencodeSession({ ...input, baseUrl: options.baseUrl });
      }
      return requireFallbackGateway(fallback).createSession(input);
    },
    sendPrompt(input) {
      if (options.sendPrompt) {
        return options.sendPrompt({ ...input, baseUrl: options.baseUrl });
      }
      return requireFallbackGateway(fallback).sendPrompt(input);
    },
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
  if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
    return error.status;
  }

  if (error instanceof Error && typeof error.cause === "object" && error.cause !== null) {
    const cause = error.cause as { status?: unknown };
    if (typeof cause.status === "number") return cause.status;
  }

  return undefined;
}

function extractMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return undefined;
}

const stubCreateOpencodeSession: CreateOpencodeSessionFn = async (input) => ({
  id: `stub-opencode-${randomUUID()}`,
  title: input.title,
});

const stubSendPrompt: SendPromptFn = async () => ({ ok: true });

function createStubOpencodeGateway(baseUrl: string): OpencodeGateway {
  return {
    createSession(input) {
      return stubCreateOpencodeSession({ ...input, baseUrl });
    },
    sendPrompt(input) {
      return stubSendPrompt({ ...input, baseUrl });
    },
  };
}

function requireFallbackGateway(gateway: OpencodeGateway | undefined) {
  if (!gateway) {
    throw new Error("Opencode gateway fallback is not configured.");
  }
  return gateway;
}
