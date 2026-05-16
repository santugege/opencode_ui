import type { ChatMessage, SessionFile, WorkspaceSession } from "@opencode-ui/shared";
import type { MemoryDatabase } from "../repositories/memory.repository";

/**
 * 将文件记录序列化为 API 响应结构。
 */
export function serializeFile(file: SessionFile) {
  return file;
}

/**
 * 将聊天消息及其嵌套文件记录序列化为 API 响应结构。
 */
export function serializeMessage(message: ChatMessage) {
  return {
    ...message,
    files: message.files.map(serializeFile),
  };
}

/**
 * 将工作区会话连同当前文件和消息历史序列化为 API 响应结构。
 */
export function serializeSession(session: WorkspaceSession, db: MemoryDatabase) {
  return {
    ...session,
    files: db.listSessionFiles(session.id).map(serializeFile),
    messages: db.listChatMessages(session.id).map(serializeMessage),
  };
}
