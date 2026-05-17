import type { FileKind, MessageRole, SessionStatus } from "@opencode-ui/shared";

export type ComposerFileStatus = "ready" | "uploading" | "error";
export type WorkspacePrimaryView = "chat" | "videoTasks";

export interface UserView {
  email: string;
}

export interface ModelSelectionView {
  providerID: string;
  modelID: string;
}

export interface ModelOptionView {
  id: string;
  providerID: string;
  providerName: string;
  modelID: string;
  name: string;
  isDefault: boolean;
  contextWindow?: number;
  outputLimit?: number;
  supportsAttachments?: boolean;
  supportsReasoning?: boolean;
  supportsTools?: boolean;
}

export interface ModelProviderView {
  id: string;
  name: string;
  defaultModelID?: string;
  models: ModelOptionView[];
}

export interface ModelCatalogView {
  defaultModelIDs: Record<string, string>;
  models: ModelOptionView[];
  providers: ModelProviderView[];
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
  isStreaming?: boolean;
}

export type QuestionAnswerView = string[];

export type QuestionSubmissionStatus = "replying" | "rejecting";

export interface QuestionOptionView {
  label: string;
  description: string;
}

export interface QuestionItemView {
  question: string;
  header: string;
  options: QuestionOptionView[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequestView {
  id: string;
  sessionID: string;
  questions: QuestionItemView[];
  submissionStatus?: QuestionSubmissionStatus;
  tool?: {
    messageID: string;
    callID: string;
  };
}

export interface WorkspaceViewModel {
  user: UserView;
  sessions: SessionListItemView[];
  activeSessionId: string | null;
  messages: ChatMessageView[];
  pendingQuestions?: QuestionRequestView[];
  composerFiles: FileAttachmentView[];
  error?: string;
  isCancelling?: boolean;
  isStreaming?: boolean;
  isLoadingModels?: boolean;
  modelCatalog?: ModelCatalogView;
  modelLoadError?: string;
  modelSelection?: ModelSelectionView;
}
