import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { ServerResponse } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import { ApiHttpError } from "../app/errors";
import { errorMessage, sseHeaders, writeSseChunk, writeSseEvent } from "../app/sse";
import type { MemoryDatabase, ResponseRecord, ResponseStatus } from "../repositories/memory.repository";
import type { AuthService } from "../services/auth.service";
import type { OpencodeGateway } from "../services/opencode.service";
import type { OpencodeModelSelection } from "../types/opencode";
import { requireCurrentUser } from "./guards";

const DEFAULT_SESSION_TITLE = "未命名会话";
const SUPPORTED_CREATE_FIELDS = new Set(["conversation", "input", "instructions", "model", "previous_response_id", "stream"]);

/**
 * Responses API 兼容路由需要的依赖。
 */
export interface ResponsesRoutesOptions {
  /** 用于解析当前用户的认证服务。 */
  auth: AuthService;
  /** 保存 response/session 映射和上传文件索引。 */
  db: MemoryDatabase;
  /** 负责调用 opencode session、prompt 和事件流。 */
  opencode: OpencodeGateway;
}

interface ParsedCreateResponseBody {
  conversationId?: string;
  fileIds: string[];
  instructions?: string;
  model?: OpencodeModelSelection;
  previousResponseId?: string;
  text: string;
}

interface ResponseParams {
  responseId: string;
}

/**
 * 注册 OpenAI Responses 形态的 opencode 流式接口。
 */
export const responsesRoutes: FastifyPluginAsync<ResponsesRoutesOptions> = async (app, options) => {
  app.post("/v1/responses", async (request, reply) => {
    const current = requireCurrentUser(options.auth, request);
    const input = parseCreateResponseBody(request.body);
    const session = input.previousResponseId
      ? await sessionFromPreviousResponse(options, current.user.id, current.user.workspacePath, input.previousResponseId)
      : input.conversationId
        ? await requireOwnedOpencodeSession(options.opencode, current.user.workspacePath, input.conversationId)
        : await options.opencode.createSession({
            title: DEFAULT_SESSION_TITLE,
            workspacePath: current.user.workspacePath,
          });
    const attachedFiles = resolveAttachedFiles(options.db, current.user.workspacePath, session.id, input.fileIds);
    const response = createResponseRecord(options.db, {
      previousResponseId: input.previousResponseId,
      sessionId: session.id,
      userId: current.user.id,
    });
    const eventStream = await options.opencode.subscribeEvents({ workspacePath: current.user.workspacePath });
    const raw = reply.raw;
    const headers = sseHeaders(reply.getHeaders());

    reply.hijack();
    raw.writeHead(200, headers);
    await writeResponseStatusEvent(raw, "response.created", response, session.id, input.model);

    const reader = eventStream.body.getReader();
    const parser = new SseFrameParser();
    let closed = false;
    const closeStream = () => {
      closed = true;
      eventStream.close();
      void reader.cancel().catch(() => undefined);
    };

    raw.once("close", closeStream);
    try {
      await options.opencode.sendPromptAsync({
        files: attachedFiles,
        model: input.model,
        sessionId: session.id,
        system: input.instructions,
        text: input.text,
        workspacePath: current.user.workspacePath,
      });

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (raw.destroyed || raw.writableEnded) break;
        await writeSseChunk(raw, value);

        const terminalStatus = await terminalStatusFromFrames(
          options.db,
          response.id,
          session.id,
          parser.push(value),
        );
        if (terminalStatus) {
          const nextResponse = updateResponseStatus(options.db, response.id, terminalStatus);
          await writeResponseStatusEvent(raw, responseEventName(terminalStatus), nextResponse, session.id, input.model);
          break;
        }
      }
    } catch (error) {
      if (!closed && !raw.destroyed && !raw.writableEnded) {
        const failed = updateResponseStatus(options.db, response.id, "failed");
        await writeResponseStatusEvent(raw, "response.failed", failed, session.id, input.model, errorMessage(error));
      }
    } finally {
      raw.off("close", closeStream);
      eventStream.close();
      if (!raw.destroyed && !raw.writableEnded) raw.end();
    }
  });

  app.post<{ Params: ResponseParams }>("/v1/responses/:responseId/cancel", async (request, reply) => {
    const current = requireCurrentUser(options.auth, request);
    const response = requireOwnedResponse(options.db, current.user.id, request.params.responseId);
    await requireOwnedOpencodeSession(options.opencode, current.user.workspacePath, response.sessionId);
    await options.opencode.abortSession({
      sessionId: response.sessionId,
      workspacePath: current.user.workspacePath,
    });
    const cancelled = updateResponseStatus(options.db, response.id, "cancelled");

    reply.code(200);
    return toResponsePayload(cancelled, response.sessionId);
  });
};

function parseCreateResponseBody(body: unknown): ParsedCreateResponseBody {
  const value = requireObject(body, "Request body must be a JSON object.");
  for (const key of Object.keys(value)) {
    if (!SUPPORTED_CREATE_FIELDS.has(key)) {
      throw new ApiHttpError(400, `Unsupported Responses API field: ${key}.`);
    }
  }
  if (value.stream !== undefined && value.stream !== true) {
    throw new ApiHttpError(400, "Responses stream must be true when provided.");
  }
  if (value.previous_response_id !== undefined && value.conversation !== undefined) {
    throw new ApiHttpError(400, "previous_response_id and conversation cannot be used together.");
  }

  const input = parseResponseInput(value.input);
  return {
    conversationId: parseConversationId(value.conversation),
    fileIds: input.fileIds,
    instructions: optionalNonEmptyString(value.instructions, "instructions"),
    model: parseModel(value.model),
    previousResponseId: optionalNonEmptyString(value.previous_response_id, "previous_response_id"),
    text: input.text,
  };
}

function parseResponseInput(input: unknown) {
  const textParts: string[] = [];
  const fileIds: string[] = [];
  const appendText = (value: unknown, field: string) => {
    if (typeof value !== "string") throw new ApiHttpError(400, `${field} must be a string.`);
    if (value.trim()) textParts.push(value.trim());
  };
  const appendFile = (value: unknown) => {
    const file = requireObject(value, "input_file content must be an object.");
    if (file.file_data !== undefined || file.file_url !== undefined) {
      throw new ApiHttpError(400, "Only input_file.file_id is supported.");
    }
    const fileId = optionalNonEmptyString(file.file_id, "input_file.file_id");
    if (!fileId) throw new ApiHttpError(400, "input_file.file_id is required.");
    fileIds.push(fileId);
  };
  const parseContent = (content: unknown) => {
    if (typeof content === "string") {
      appendText(content, "message.content");
      return;
    }
    if (!Array.isArray(content)) throw new ApiHttpError(400, "message.content must be a string or content array.");
    for (const part of content) {
      const partObject = requireObject(part, "message.content item must be an object.");
      if (partObject.type === "input_text") {
        appendText(partObject.text, "input_text.text");
      } else if (partObject.type === "input_file") {
        appendFile(partObject);
      } else {
        throw new ApiHttpError(400, `Unsupported input content type: ${String(partObject.type)}.`);
      }
    }
  };
  const parseItem = (item: unknown) => {
    if (typeof item === "string") {
      appendText(item, "input item");
      return;
    }
    const object = requireObject(item, "input item must be an object.");
    if (object.type === "input_text") {
      appendText(object.text, "input_text.text");
      return;
    }
    if (object.type === "input_file") {
      appendFile(object);
      return;
    }
    if (object.type === "message" || "content" in object || "role" in object) {
      const role = object.role;
      if (role !== undefined && role !== "user") {
        throw new ApiHttpError(400, "Only user input messages are supported.");
      }
      parseContent(object.content);
      return;
    }
    throw new ApiHttpError(400, `Unsupported input item type: ${String(object.type)}.`);
  };

  if (typeof input === "string") {
    appendText(input, "input");
  } else if (Array.isArray(input)) {
    for (const item of input) parseItem(item);
  } else {
    throw new ApiHttpError(400, "input must be a string or an array.");
  }

  const text = textParts.join("\n").trim();
  if (!text) throw new ApiHttpError(400, "input must include non-empty input_text.");
  return { fileIds: Array.from(new Set(fileIds)), text };
}

function parseModel(value: unknown): OpencodeModelSelection | undefined {
  if (value === undefined) return undefined;
  const model = requireObject(value, "model must be an object with providerID and modelID.");
  const providerID = optionalNonEmptyString(model.providerID, "model.providerID");
  const modelID = optionalNonEmptyString(model.modelID, "model.modelID");
  if (!providerID || !modelID) {
    throw new ApiHttpError(400, "model.providerID and model.modelID are required.");
  }
  return { providerID, modelID };
}

function parseConversationId(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return optionalNonEmptyString(value, "conversation");
  const conversation = requireObject(value, "conversation must be a string or object with id.");
  const id = optionalNonEmptyString(conversation.id, "conversation.id");
  if (!id) throw new ApiHttpError(400, "conversation.id is required.");
  return id;
}

function resolveAttachedFiles(db: MemoryDatabase, workspacePath: string, sessionId: string, fileIds: string[]) {
  const allFiles = db.listSessionFiles(sessionId);
  const requestedFileIds = new Set(fileIds);
  const attachedFiles = allFiles.filter((file) => requestedFileIds.has(file.id));
  if (attachedFiles.length !== requestedFileIds.size) {
    throw new ApiHttpError(400, "One or more input_file.file_id values were not found in this conversation.");
  }
  return attachedFiles.map((file) => ({
    absolutePath: resolve(workspacePath, file.relativePath),
    filename: file.name,
    mimeType: file.mimeType,
  }));
}

function createResponseRecord(
  db: MemoryDatabase,
  input: { previousResponseId?: string; sessionId: string; userId: string },
) {
  const now = new Date().toISOString();
  return db.createResponse({
    createdAt: now,
    id: `resp_${randomUUID().replaceAll("-", "_")}`,
    previousResponseId: input.previousResponseId,
    sessionId: input.sessionId,
    status: "in_progress",
    updatedAt: now,
    userId: input.userId,
  });
}

async function sessionFromPreviousResponse(
  options: ResponsesRoutesOptions,
  userId: string,
  workspacePath: string,
  previousResponseId: string,
) {
  const previousResponse = requireOwnedResponse(options.db, userId, previousResponseId);
  return await requireOwnedOpencodeSession(options.opencode, workspacePath, previousResponse.sessionId);
}

function requireOwnedResponse(db: MemoryDatabase, userId: string, responseId: string | undefined) {
  if (!responseId) throw new ApiHttpError(404, "Response not found.");
  const response = db.findResponseById(responseId);
  if (!response || response.userId !== userId) throw new ApiHttpError(404, "Response not found.");
  return response;
}

async function requireOwnedOpencodeSession(opencode: OpencodeGateway, workspacePath: string, sessionId: string | undefined) {
  if (!sessionId) throw new ApiHttpError(404, "Session not found.");
  const sessions = await opencode.listSessions({ workspacePath });
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new ApiHttpError(404, "Session not found.");
  return session;
}

async function terminalStatusFromFrames(
  db: MemoryDatabase,
  responseId: string,
  sessionId: string,
  frames: string[],
): Promise<ResponseStatus | undefined> {
  for (const frame of frames) {
    const event = parseOpencodeEvent(frame);
    if (!event) continue;
    if (event.type === "session.error" && sameSessionOrGlobal(event, sessionId)) {
      return db.findResponseById(responseId)?.status === "cancelled" ? "cancelled" : "failed";
    }
    if (event.type === "session.idle" && sameSessionOrGlobal(event, sessionId)) {
      return db.findResponseById(responseId)?.status === "cancelled" ? "cancelled" : "completed";
    }
  }
  return undefined;
}

function parseOpencodeEvent(frame: string): { type?: string; properties?: unknown } | undefined {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("\n");
  if (!data.trim()) return undefined;
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === "object" && parsed !== null) return parsed as { type?: string; properties?: unknown };
  } catch {
    return undefined;
  }
  return undefined;
}

function sameSessionOrGlobal(event: { properties?: unknown }, sessionId: string) {
  const properties = event.properties;
  if (typeof properties !== "object" || properties === null) return true;
  const value = "sessionID" in properties ? properties.sessionID : undefined;
  return value === undefined || value === sessionId;
}

function updateResponseStatus(db: MemoryDatabase, responseId: string, status: ResponseStatus) {
  const response = db.updateResponseStatus({
    id: responseId,
    status,
    updatedAt: new Date().toISOString(),
  });
  if (!response) throw new ApiHttpError(404, "Response not found.");
  return response;
}

async function writeResponseStatusEvent(
  raw: ServerResponse,
  event: string,
  response: ResponseRecord,
  sessionId: string,
  model?: OpencodeModelSelection,
  error?: string,
) {
  await writeSseEvent(raw, event, {
    ...toResponsePayload(response, sessionId, model),
    error: error ? { message: error } : undefined,
  });
}

function toResponsePayload(response: ResponseRecord, sessionId: string, model?: OpencodeModelSelection) {
  return {
    id: response.id,
    object: "response",
    created_at: Math.floor(new Date(response.createdAt).getTime() / 1000),
    status: response.status,
    model,
    previous_response_id: response.previousResponseId ?? null,
    conversation: { id: sessionId },
  };
}

function responseEventName(status: ResponseStatus) {
  if (status === "completed") return "response.completed";
  if (status === "cancelled") return "response.cancelled";
  return "response.failed";
}

function optionalNonEmptyString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new ApiHttpError(400, `${field} must be a non-empty string.`);
  return value.trim();
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiHttpError(400, message);
  }
  return value as Record<string, unknown>;
}

/**
 * 只解析事件边界，不改变原始 opencode SSE 字节；路由仍然把上游事件原样写给浏览器。
 */
class SseFrameParser {
  private readonly decoder = new TextDecoder();
  private buffer = "";

  push(value: Uint8Array) {
    this.buffer += this.decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const chunks = this.buffer.split("\n\n");
    this.buffer = chunks.pop() ?? "";
    return chunks;
  }
}
