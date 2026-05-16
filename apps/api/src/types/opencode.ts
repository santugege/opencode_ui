/**
 * 以本地文件 URL 形式传给 opencode 的附件。
 */
export interface PromptAttachmentInput {
  /** 位于会话工作区内的文件系统绝对路径。 */
  absolutePath: string;
  /** 浏览器上传时提供并持久化的 MIME 类型。 */
  mimeType: string;
  /** 展示给 opencode 的原始文件名。 */
  filename: string;
}

/**
 * API 层当前需要使用的最小 opencode 会话数据。
 */
export interface OpencodeSessionData {
  /** opencode 会话标识。 */
  id: string;
  /** opencode 返回的可选标题。 */
  title?: string;
}

/**
 * 后端使用的 SDK client 最小接口。保持窄接口可以避免应用依赖无关的生成 SDK 方法。
 */
export interface OpencodeSdkClient {
  /** 工作区聊天流程需要的会话端点。 */
  session: Partial<{
    create: (input: {
      body: { title: string };
      query?: { directory: string };
    }) => Promise<{ data: OpencodeSessionData }>;
    prompt: (input: {
      body: {
        parts: Array<
          | { type: "file"; mime: string; filename: string; url: string }
          | { type: "text"; text: string }
        >;
      };
      path: { id: string };
      query?: { directory: string };
    }) => Promise<unknown>;
  }>;
}

/**
 * API 进程持有的唯一 opencode SDK client 工厂。
 */
export type CreateOpencodeClient = (config: {
  /** opencode 服务的基础 URL。 */
  baseUrl: string;
  /** 让 SDK 失败时抛出错误，交给 Fastify 错误处理器映射。 */
  throwOnError: true;
}) => OpencodeSdkClient;

/**
 * opencode 服务传递给 HTTP 错误处理层的错误结构。
 */
export interface OpencodeApiError {
  /** 表示 SDK 失败原因的类 HTTP 状态码。 */
  status: number;
  /** 面向人的失败原因描述。 */
  message: string;
  /** 调用方是否可以在不修改入参的情况下重试。 */
  retryable: boolean;
}
