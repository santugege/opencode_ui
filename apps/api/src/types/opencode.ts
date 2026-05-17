/**
 * 以本地文件 URL 形式传给 opencode 的附件。
 */
export interface PromptAttachmentInput {
  /** 位于用户工作区内的文件系统绝对路径。 */
  absolutePath: string;
  /** 浏览器上传时提供并持久化的 MIME 类型。 */
  mimeType: string;
  /** 展示给 opencode 的原始文件名。 */
  filename: string;
}

/**
 * opencode SDK 原生模型选择结构。
 */
export interface OpencodeModelSelection {
  providerID: string;
  modelID: string;
}

/**
 * opencode 暴露给客户端选择的模型元数据。字段保持宽松，
 * API 层只读取 UI 展示需要的稳定字段。
 */
export interface OpencodeModelData {
  id?: string;
  name?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  limit?: {
    context?: number;
    output?: number;
  };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
  [key: string]: unknown;
}

/**
 * opencode provider 及其可用模型。
 */
export interface OpencodeProviderData {
  id: string;
  name?: string;
  models: Record<string, OpencodeModelData>;
  [key: string]: unknown;
}

/**
 * opencode `/config/providers` 返回的模型目录。
 */
export interface OpencodeModelCatalogData {
  default: Record<string, string>;
  providers: OpencodeProviderData[];
}

/**
 * API 层当前需要使用的最小 opencode 会话数据。
 */
export interface OpencodeSessionData {
  /** opencode 会话标识。 */
  id: string;
  /** opencode 返回的标题。 */
  title: string;
  /** opencode 返回的时间戳，单位可能为秒或毫秒。 */
  time: {
    created: number;
    updated: number;
  };
}

/**
 * API 层需要呈现的最小 opencode 会话状态。
 */
export type OpencodeSessionStatusData =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

/**
 * opencode question tool 的选项。
 */
export interface OpencodeQuestionOption {
  /** 展示给用户的选项文本，也是 reply answers 使用的值。 */
  label: string;
  /** 选项说明。 */
  description: string;
}

/**
 * opencode question tool 的单个问题。
 */
export interface OpencodeQuestionInfo {
  /** 完整问题文本。 */
  question: string;
  /** 短标题。 */
  header: string;
  /** 可选答案。 */
  options: OpencodeQuestionOption[];
  /** 是否允许多选。 */
  multiple?: boolean;
  /** 是否允许用户输入自定义答案。 */
  custom?: boolean;
}

/**
 * opencode question tool 关联的工具调用信息。
 */
export interface OpencodeQuestionTool {
  messageID: string;
  callID: string;
}

/**
 * opencode 等待用户回答的问题请求。
 */
export interface OpencodeQuestionRequest {
  id: string;
  sessionID: string;
  questions: OpencodeQuestionInfo[];
  tool?: OpencodeQuestionTool;
}

/**
 * 单个问题的回答。opencode 要求按问题顺序传入字符串数组数组。
 */
export type OpencodeQuestionAnswer = string[];

/**
 * API 层需要呈现的最小 opencode 消息数据。
 */
export interface OpencodeMessageData {
  info: {
    id: string;
    sessionID?: string;
    role: "user" | "assistant" | "system";
    time: {
      created: number;
    };
  };
  parts: Array<
    | { id?: string; type: "text"; text: string }
    | { id?: string; type: "file"; mime: string; filename?: string; url: string }
    | { id?: string; type: string }
  >;
}

/**
 * 后端向浏览器透传 opencode SSE 时持有的上游事件流。
 */
export interface OpencodeEventStream {
  /** opencode 返回的原始 SSE 字节流。 */
  body: ReadableStream<Uint8Array>;
  /** 浏览器断开连接或 API 关闭响应时取消上游订阅。 */
  close(): void;
}

/**
 * 后端使用的 SDK client 最小接口。保持窄接口可以避免应用依赖无关的生成 SDK 方法。
 */
export interface OpencodeSdkClient {
  /** 配置端点用于读取当前工作区可用 provider/model。 */
  config?: Partial<{
    providers: (input?: {
      query?: { directory: string };
    }) => Promise<{ data: OpencodeModelCatalogData }>;
  }>;
  /** 工作区聊天流程需要的会话端点。 */
  session: Partial<{
    list: (input?: {
      query?: { directory: string };
    }) => Promise<{ data: OpencodeSessionData[] }>;
    create: (input: {
      body: { title: string };
      query?: { directory: string };
    }) => Promise<{ data: OpencodeSessionData }>;
    status: (input?: {
      query?: { directory: string };
    }) => Promise<{ data: Record<string, OpencodeSessionStatusData> }>;
    messages: (input: {
      path: { id: string };
      query?: { directory: string };
    }) => Promise<{ data: OpencodeMessageData[] }>;
    prompt: (input: {
      body: {
        model?: OpencodeModelSelection;
        system?: string;
        parts: Array<
          | { type: "file"; mime: string; filename: string; url: string }
          | { type: "text"; text: string }
        >;
      };
      path: { id: string };
      query?: { directory: string };
    }) => Promise<{ data: OpencodeMessageData }>;
    promptAsync: (input: {
      body: {
        model?: OpencodeModelSelection;
        system?: string;
        parts: Array<
          | { type: "file"; mime: string; filename: string; url: string }
          | { type: "text"; text: string }
        >;
      };
      path: { id: string };
      query?: { directory: string };
    }) => Promise<{ data: void }>;
    abort: (input: {
      path: { id: string };
      query?: { directory: string };
    }) => Promise<{ data: boolean }>;
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
