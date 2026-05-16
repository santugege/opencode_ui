export type SessionStatus = "ready" | "thinking" | "running_tool" | "error";
export type MessageRole = "user" | "assistant" | "system";
export type FileKind = "image" | "video" | "document" | "spreadsheet" | "other";

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface WorkspaceSession {
  id: string;
  userId: string;
  opencodeSessionId: string | null;
  title: string;
  status: SessionStatus;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionFile {
  id: string;
  sessionId: string;
  name: string;
  kind: FileKind;
  mimeType: string;
  size: number;
  relativePath: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  files: SessionFile[];
  createdAt: string;
}
