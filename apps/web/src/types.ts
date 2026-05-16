import type { FileKind, MessageRole, SessionStatus } from "@opencode-ui/shared";

export type ComposerFileStatus = "ready" | "uploading" | "error";

export interface UserView {
  email: string;
}

export interface SessionListItemView {
  id: string;
  title: string;
  status: SessionStatus;
  updatedAtLabel: string;
}

export interface FileAttachmentView {
  id: string;
  name: string;
  kind: FileKind;
  sizeLabel: string;
  status: ComposerFileStatus;
  progress?: number;
}

export interface ChatMessageView {
  id: string;
  role: MessageRole;
  content: string;
  createdAtLabel: string;
  files: FileAttachmentView[];
}

export interface WorkspaceViewModel {
  user: UserView;
  sessions: SessionListItemView[];
  activeSessionId: string | null;
  messages: ChatMessageView[];
  composerFiles: FileAttachmentView[];
  error?: string;
}
