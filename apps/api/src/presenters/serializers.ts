import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChatMessage, MessageRole, SessionFile, SessionStatus } from "@opencode-ui/shared";
import type { MemoryDatabase } from "../repositories/memory.repository";
import type { OpencodeMessageData, OpencodeSessionData, OpencodeSessionStatusData } from "../types/opencode";
import { inferFileKind } from "../services/file.service";

/**
 * 将文件记录序列化为 API 响应结构。
 */
export function serializeFile(file: SessionFile) {
  return file;
}

interface OpencodeSessionSerializationInput {
  /** 用于读取当前会话关联上传文件的仓储。 */
  db: MemoryDatabase;
  /** opencode 返回的会话主体数据。 */
  session: OpencodeSessionData;
  /** opencode 返回的会话运行状态，缺失时按 idle 处理。 */
  status?: OpencodeSessionStatusData;
  /** 当前用户工作区绝对路径，用于还原 file:// 附件引用。 */
  workspacePath: string;
}

/**
 * 将 opencode 会话序列化为左侧历史列表需要的摘要数据。
 */
export function serializeOpencodeSessionSummary(input: OpencodeSessionSerializationInput) {
  return {
    id: input.session.id,
    title: requiredString(input.session.title, "session.title"),
    status: serializeSessionStatus(input.status),
    updatedAt: isoFromOpencodeTime(input.session.time?.updated ?? input.session.time?.created, "session.time.updated"),
    files: input.db.listSessionFiles(input.session.id).map(serializeFile),
  };
}

/**
 * 将单个 opencode 会话和消息详情组合成聊天工作区需要的完整结构。
 */
export function serializeOpencodeSessionDetail(input: OpencodeSessionSerializationInput & { messages: OpencodeMessageData[] }) {
  return {
    ...serializeOpencodeSessionSummary(input),
    messages: input.messages.map((message) =>
      serializeOpencodeMessage({
        db: input.db,
        message,
        sessionId: input.session.id,
        workspacePath: input.workspacePath,
      }),
    ),
  };
}

/**
 * 将 opencode 消息及其文本/文件 part 转成前端稳定契约。
 */
export function serializeOpencodeMessage(input: {
  db: MemoryDatabase;
  message: OpencodeMessageData;
  sessionId: string;
  workspacePath: string;
}): ChatMessage {
  const textParts = input.message.parts.filter(isTextPart);
  const fileParts = input.message.parts.filter(isFilePart);

  return {
    id: input.message.info.id,
    sessionId: input.sessionId,
    role: serializeMessageRole(input.message.info.role),
    content: textParts.map((part) => part.text).join("\n").trim(),
    files: fileParts.map((part) =>
      serializeFilePart(input.db, input.workspacePath, input.sessionId, part, input.message.info.time?.created),
    ),
    createdAt: isoFromOpencodeTime(input.message.info.time?.created, "message.info.time.created"),
  };
}

/**
 * 将 opencode 运行状态压缩成前端当前支持的状态枚举。
 */
export function serializeSessionStatus(status: OpencodeSessionStatusData | undefined): SessionStatus {
  if (!status || status.type === "idle") return "ready";
  if (status.type === "busy") return "thinking";
  return "error";
}

/**
 * 将 opencode 角色映射到产品侧支持的消息角色集合。
 */
function serializeMessageRole(role: OpencodeMessageData["info"]["role"]): MessageRole {
  if (role === "assistant" || role === "system") return role;
  return "user";
}

/**
 * 将 opencode file part 还原成本地上传文件；未命中索引时保留可展示的远端附件信息。
 */
function serializeFilePart(
  db: MemoryDatabase,
  workspacePath: string,
  sessionId: string,
  part: Extract<OpencodeMessageData["parts"][number], { type: "file" }>,
  messageCreatedAt: number | undefined,
): SessionFile {
  const uploadedFile = db
    .listSessionFiles(sessionId)
    .find((file) => pathToFileURL(resolve(workspacePath, file.relativePath)).href === part.url);
  if (uploadedFile) return uploadedFile;

  return {
    id: part.id ?? part.url,
    sessionId,
    name: part.filename ?? "attachment",
    kind: inferFileKind(part.mime),
    mimeType: part.mime,
    size: 0,
    relativePath: "",
    createdAt: isoFromOpencodeTime(messageCreatedAt, "message.info.time.created"),
  };
}

/**
 * 类型收窄：只允许带 text 字符串的文本 part 进入消息内容拼接。
 */
function isTextPart(part: OpencodeMessageData["parts"][number]): part is Extract<OpencodeMessageData["parts"][number], { type: "text" }> {
  return part.type === "text" && "text" in part && typeof part.text === "string";
}

/**
 * 类型收窄：只允许同时带 url 和 mime 的文件 part 进入附件序列化。
 */
function isFilePart(part: OpencodeMessageData["parts"][number]): part is Extract<OpencodeMessageData["parts"][number], { type: "file" }> {
  return part.type === "file" && "url" in part && typeof part.url === "string" && "mime" in part && typeof part.mime === "string";
}

/**
 * opencode 时间戳可能是秒或毫秒，统一转换成前端使用的 ISO 字符串。
 */
function isoFromOpencodeTime(value: number | undefined, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid opencode timestamp: ${field}`);
  }
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
  return new Date(milliseconds).toISOString();
}

/**
 * 对 opencode 必填字符串快速失败，避免前端收到无意义的空标题。
 */
function requiredString(value: string | undefined, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid opencode string: ${field}`);
  }
  return value;
}
