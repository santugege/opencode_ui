import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { FileKind, SessionStatus } from "@opencode-ui/shared";
import {
  browserApi,
  type ApiClient,
  type ApiFile,
  type ApiModelCatalog,
  type ApiModelSelection,
  type ApiQuestionAnswer,
  type ApiQuestionInfo,
  type ApiQuestionRequest,
  type ApiSession,
  type ApiSessionDetail,
  type ApiStreamEvent,
} from "./api";
import { AuthScreen, type AuthMode } from "./components/AuthScreen";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { SessionSidebar } from "./components/SessionSidebar";
import { VideoTaskCenter } from "./components/VideoTaskCenter";
import type {
  ChatMessageView,
  FileAttachmentView,
  ModelCatalogView,
  ModelSelectionView,
  QuestionRequestView,
  QuestionSubmissionStatus,
  WorkspacePrimaryView,
  WorkspaceViewModel,
} from "./types";
import "./styles.css";

export interface WorkspaceAppProps {
  activeView?: WorkspacePrimaryView;
  model?: WorkspaceViewModel;
  onAttachFiles?: (files: File[]) => void;
  onCancelResponse?: () => void;
  onCreateSession?: () => void;
  onOpenChat?: () => void;
  onOpenVideoTasks?: () => void;
  onModelSelectionChange?: (model: ModelSelectionView) => void;
  onRejectQuestion?: (requestId: string) => Promise<void> | void;
  onRetry?: () => void;
  onReplyQuestion?: (requestId: string, answers: ApiQuestionAnswer[]) => Promise<void> | void;
  onSelectSession?: (sessionId: string) => void;
  onSignOut?: () => void;
  onSendMessage?: (text: string) => boolean | Promise<boolean | void> | void;
  videoTasksContent?: ReactNode;
}

const defaultModel: WorkspaceViewModel = {
  user: {
    email: "demo@example.com",
  },
  sessions: [
    {
      id: "session-chat",
      title: "文档审阅",
      status: "thinking",
      updatedAtLabel: "刚刚",
    },
    {
      id: "session-empty",
      title: "未命名会话",
      status: "ready",
      updatedAtLabel: "12 分钟前",
    },
    {
      id: "session-error",
      title: "视频笔记",
      status: "error",
      updatedAtLabel: "昨天",
    },
  ],
  activeSessionId: "session-chat",
  messages: [
    {
      id: "message-demo-1",
      role: "user",
      content: "对比这些笔记，并告诉我评审前需要跟进的事项。",
      createdAtLabel: "21:12",
      files: [
        {
          id: "file-demo-1",
          name: "review-notes.pdf",
          kind: "document",
          sizeLabel: "1.8 MB",
          status: "ready",
        },
      ],
    },
    {
      id: "message-demo-2",
      role: "assistant",
      content: "我发现了四个待确认问题、两个缺少负责人的事项，以及一个分享前需要补充来源的段落。",
      createdAtLabel: "21:13",
      files: [],
    },
  ],
  composerFiles: [
    {
      id: "file-demo-2",
      name: "meeting-capture.png",
      kind: "image",
      sizeLabel: "422 KB",
      status: "ready",
    },
    {
      id: "file-demo-3",
      name: "interview-notes.docx",
      kind: "document",
      sizeLabel: "84 KB",
      status: "uploading",
      progress: 62,
    },
  ],
  modelSelection: {
    modelID: "",
    providerID: "",
  },
};

export function WorkspaceApp({
  activeView = "chat",
  model = defaultModel,
  onAttachFiles,
  onCancelResponse,
  onCreateSession,
  onOpenChat,
  onOpenVideoTasks,
  onModelSelectionChange,
  onRejectQuestion,
  onRetry,
  onReplyQuestion,
  onSelectSession,
  onSignOut,
  onSendMessage,
  videoTasksContent,
}: WorkspaceAppProps) {
  const activeSession =
    model.sessions.find((session) => session.id === model.activeSessionId) ?? null;

  return (
    <main className="app-shell">
      <SessionSidebar
        activeSessionId={model.activeSessionId}
        activeView={activeView}
        onCreateSession={onCreateSession}
        onOpenChat={onOpenChat}
        onOpenVideoTasks={onOpenVideoTasks}
        onSelectSession={onSelectSession}
        onSignOut={onSignOut}
        sessions={model.sessions}
        user={model.user}
      />
      <div className="workspace">
        {activeView === "videoTasks" ? (
          videoTasksContent
        ) : (
          <>
            <ChatView
              activeSession={activeSession}
              error={model.error}
              isCancelling={model.isCancelling}
              isStreaming={model.isStreaming}
              messages={model.messages}
              onCancelResponse={onCancelResponse}
              onRejectQuestion={onRejectQuestion}
              onRetry={onRetry}
              onReplyQuestion={onReplyQuestion}
              pendingQuestions={model.pendingQuestions}
            />
            <Composer
              files={model.composerFiles}
              isLoadingModels={model.isLoadingModels}
              isStreaming={model.isStreaming}
              modelCatalog={model.modelCatalog}
              modelLoadError={model.modelLoadError}
              modelSelection={model.modelSelection}
              onAttachFiles={onAttachFiles}
              onModelSelectionChange={onModelSelectionChange}
              onSendMessage={onSendMessage}
            />
          </>
        )}
      </div>
    </main>
  );
}

interface StreamingState {
  assistantMessage: ChatMessageView;
  isCancelling: boolean;
  messageRolesById: Record<string, ChatMessageView["role"]>;
  responseId?: string;
  sessionId: string;
  startedAt: number;
  userMessage: ChatMessageView;
}

const LOCAL_SESSION_PREFIX = "local-session-";

const emptyModelCatalog: ModelCatalogView = {
  defaultModelIDs: {},
  models: [],
  providers: [],
};

interface AppProps {
  api?: ApiClient;
}

export default function App({ api = browserApi }: AppProps) {
  const [activeView, setActiveView] = useState<WorkspacePrimaryView>("chat");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | undefined>();
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogView>(emptyModelCatalog);
  const [modelLoadError, setModelLoadError] = useState<string | undefined>();
  const [modelSelection, setModelSelection] = useState<ModelSelectionView>({
    modelID: "",
    providerID: "",
  });
  const [pendingFiles, setPendingFiles] = useState<FileAttachmentView[]>([]);
  const [pendingFileIds, setPendingFileIds] = useState<string[]>([]);
  const [pendingQuestionsById, setPendingQuestionsById] = useState<Record<string, ApiQuestionRequest>>({});
  const [questionSubmissionById, setQuestionSubmissionById] = useState<Record<string, QuestionSubmissionStatus>>({});
  const [sendError, setSendError] = useState<string | undefined>();
  const [sessionDetailsById, setSessionDetailsById] = useState<Record<string, ApiSessionDetail>>({});
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [streamingState, setStreamingState] = useState<StreamingState | null>(null);
  const [user, setUser] = useState<{ email: string } | null>(null);
  const responseAbortControllerRef = useRef<AbortController | null>(null);
  const isStreamingResponse = Boolean(streamingState);
  const streamingSessionId = streamingState?.sessionId;

  useEffect(() => {
    let isMounted = true;
    api.me()
      .then(async (result) => {
        if (!isMounted) return;
        if (result?.user) {
          setUser(result.user);
          const nextSessions = await api.listSessions();
          if (!isMounted) return;
          // 首页只加载左侧历史摘要，等待用户点击历史项后再读取消息详情。
          setSessions(nextSessions);
          setSessionDetailsById({});
          setActiveSessionId(null);
          void loadModelCatalog(() => isMounted);
          void refreshPendingQuestions(() => isMounted);
        }
      })
      .catch((error) => {
        if (isMounted) setSendError(error instanceof Error ? error.message : "无法加载会话历史。");
      })
      .finally(() => {
        if (isMounted) setIsCheckingAuth(false);
      });
    return () => {
      isMounted = false;
    };
  }, [api]);

  useEffect(() => {
    if (
      !user ||
      !activeSessionId ||
      isLocalSessionId(activeSessionId) ||
      isStreamingResponse ||
      streamingSessionId === activeSessionId ||
      sessionDetailsById[activeSessionId]
    ) {
      return;
    }

    let isMounted = true;
    // 用户选择历史会话时才加载该会话详情，避免首页批量请求所有消息。
    api.getSession(activeSessionId)
      .then((session) => {
        if (!isMounted) return;
        setSessionDetailsById((current) => (current[session.id] ? current : { ...current, [session.id]: session }));
      })
      .catch((error) => {
        if (isMounted) setSendError(error instanceof Error ? error.message : "无法加载会话详情。");
      });

    return () => {
      isMounted = false;
    };
  }, [activeSessionId, api, isStreamingResponse, sessionDetailsById, streamingSessionId, user]);

  const model = useMemo<WorkspaceViewModel | null>(() => {
    if (!user) return null;
    const activeSessionDetail = activeSessionId ? sessionDetailsById[activeSessionId] : undefined;
    const activeMessages = activeSessionDetail?.messages ?? [];
    const messages =
      streamingState && streamingState.sessionId === activeSessionId
        ? activeMessages.filter((message) => messageCreatedBefore(message, streamingState.startedAt)).map(toMessageView)
        : activeMessages.map(toMessageView);
    const visibleMessages =
      streamingState && streamingState.sessionId === activeSessionId
        ? [...messages, streamingState.userMessage, streamingState.assistantMessage]
        : messages;
    const pendingQuestions = Object.values(pendingQuestionsById)
      .filter((question) => question.sessionID === activeSessionId)
      .map((question) => toQuestionRequestView(question, questionSubmissionById[question.id]));

    return {
      activeSessionId,
      composerFiles: pendingFiles,
      error: sendError,
      isCancelling: streamingState?.isCancelling ?? false,
      isLoadingModels,
      isStreaming: Boolean(streamingState),
      messages: visibleMessages,
      modelCatalog,
      modelLoadError,
      modelSelection,
      pendingQuestions,
      sessions: sessions.map(toSessionView),
      user,
    };
  }, [
    activeSessionId,
    isLoadingModels,
    modelCatalog,
    modelLoadError,
    modelSelection,
    pendingFiles,
    pendingQuestionsById,
    questionSubmissionById,
    sendError,
    sessionDetailsById,
    sessions,
    streamingState,
    user,
  ]);

  async function handleAuth(input: { email: string; mode: AuthMode; password: string }) {
    setAuthError(undefined);
    setIsSubmittingAuth(true);
    try {
      const credentials = { email: input.email, password: input.password };
      const result =
        input.mode === "login"
          ? await api.login(credentials)
          : await api.register(credentials);
      setUser(result.user);
      setSendError(undefined);
      void loadModelCatalog();
      try {
        const nextSessions = await api.listSessions();
        // 认证成功后只保留摘要列表，不预取任何历史详情。
        setSessions(nextSessions);
        setSessionDetailsById({});
        setActiveSessionId(null);
        void refreshPendingQuestions();
      } catch (error) {
        setSessions([]);
        setActiveSessionId(null);
        setSendError(error instanceof Error ? error.message : "无法加载会话历史。");
      }
    } catch (error) {
      const fallbackMessage = input.mode === "login" ? "无法登录。" : "无法创建账号。";
      setAuthError(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleCreateSession() {
    setSendError(undefined);
    setActiveView("chat");
    try {
      const session = await api.createSession({ title: "未命名会话" });
      setSessions((current) => [session, ...current.filter((candidate) => candidate.id !== session.id)]);
      setSessionDetailsById((current) => ({ ...current, [session.id]: toEmptySessionDetail(session) }));
      setActiveSessionId(session.id);
      setPendingFiles([]);
      setPendingFileIds([]);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "新建会话失败。");
    }
  }

  async function handleAttachFiles(files: File[]) {
    if (streamingState) {
      setSendError("请等待当前响应结束，或先停止本次 opencode 执行。");
      return;
    }
    setSendError(undefined);
    try {
      if (!activeSessionId) {
        const session = await api.createSession({ title: "未命名会话" });
        setSessions((current) => [session, ...current]);
        setSessionDetailsById((current) => ({ ...current, [session.id]: toEmptySessionDetail(session) }));
        setActiveSessionId(session.id);
        await uploadFiles(session.id, files);
        return;
      }
      await uploadFiles(activeSessionId, files);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "上传文件失败。");
    }
  }

  async function uploadFiles(sessionId: string, files: File[]) {
    for (const file of files) {
      const tempId = `upload-${file.name}`;
      setPendingFiles((current) => [
        ...current,
        {
          id: tempId,
          kind: kindFromMime(file.type),
          name: file.name,
          progress: 62,
          sizeLabel: formatBytes(file.size),
          status: "uploading",
        },
      ]);
      let uploaded: ApiFile;
      try {
        uploaded = await api.uploadFile(sessionId, file);
      } catch (error) {
        setPendingFiles((current) =>
          current.map((candidate) =>
            candidate.id === tempId ? { ...candidate, progress: undefined, status: "error" } : candidate,
          ),
        );
        throw error;
      }
      setPendingFileIds((current) => [...current, uploaded.id]);
      setPendingFiles((current) => [
        ...current.filter((candidate) => candidate.id !== tempId),
        toFileView(uploaded),
      ]);
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId
            ? { ...session, files: [...session.files.filter((candidate) => candidate.id !== uploaded.id), uploaded] }
            : session,
        ),
      );
      // 如果该会话详情已经加载，保持详情缓存里的文件索引同步。
      setSessionDetailsById((current) => {
        const detail = current[sessionId];
        if (!detail) return current;
        return {
          ...current,
          [sessionId]: {
            ...detail,
            files: [...detail.files.filter((candidate) => candidate.id !== uploaded.id), uploaded],
          },
        };
      });
    }
  }

  async function handleSendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (streamingState) {
      setSendError("请等待当前响应结束，或先停止本次 opencode 执行。");
      return false;
    }
    if (!api.streamResponse) {
      setSendError("当前 API 客户端未配置 Responses 流接口。");
      return false;
    }
    if (pendingFiles.some((file) => file.status === "uploading")) {
      setSendError("文件仍在上传，请等待上传完成后再发送。");
      return false;
    }

    setSendError(undefined);
    try {
      const selectedModel = toApiModelSelection(modelSelection);
      if (pendingFileIds.length > 0 && !activeSessionId) {
        throw new Error("存在已上传附件，但当前会话不存在。");
      }
      // 首条纯文本消息不预创建会话，让 /v1/responses 直接创建 opencode 会话并接管标题。
      const conversationId = activeSessionId ?? undefined;
      const displaySessionId = conversationId ?? createLocalSessionId();
      const fileIds = [...pendingFileIds];
      const optimisticFiles = pendingFiles.filter((file) => file.status === "ready");
      const optimisticMessages = createStreamingMessages(trimmed, optimisticFiles);

      setActiveSessionId(displaySessionId);
      if (conversationId) {
        setSessions((current) => markSessionStatus(current, conversationId, "thinking"));
      }
      setStreamingState({
        assistantMessage: optimisticMessages.assistantMessage,
        isCancelling: false,
        messageRolesById: {},
        sessionId: displaySessionId,
        startedAt: Date.now(),
        userMessage: optimisticMessages.userMessage,
      });
      setPendingFiles([]);
      setPendingFileIds([]);
      void runResponseStream({
        conversationId,
        displaySessionId,
        fileIds,
        model: selectedModel,
        text: trimmed,
      });
      return true;
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "发送消息失败。");
      return false;
    }
  }

  async function runResponseStream(input: {
    conversationId?: string;
    displaySessionId: string;
    fileIds: string[];
    model?: ApiModelSelection;
    text: string;
  }) {
    const streamResponse = api.streamResponse;
    if (!streamResponse) {
      setSendError("当前 API 客户端未配置 Responses 流接口。");
      setStreamingState(null);
      return;
    }

    let currentSessionId = input.displaySessionId;
    const abortController = new AbortController();
    responseAbortControllerRef.current = abortController;
    try {
      const finalResponse = await streamResponse(
        {
          conversationId: input.conversationId,
          fileIds: input.fileIds,
          model: input.model,
          signal: abortController.signal,
          text: input.text,
        },
        {
          onEvent: (event) => {
            const nextSessionId = handleResponseStreamEvent(currentSessionId, event);
            if (nextSessionId) currentSessionId = nextSessionId;
          },
        },
      );
      if (finalResponse?.status === "failed") {
        setSendError(finalResponse.error?.message ?? "opencode 响应失败。");
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      setSendError(error instanceof Error ? error.message : "opencode 响应失败。");
      setSessions((current) => markSessionStatus(current, currentSessionId, "error"));
      setStreamingState((current) =>
        current?.sessionId === currentSessionId || current?.sessionId === input.displaySessionId
          ? {
              ...current,
              assistantMessage: { ...current.assistantMessage, isStreaming: false },
              isCancelling: false,
            }
          : current,
      );
    } finally {
      if (!isLocalSessionId(currentSessionId)) {
        await refreshSessionAfterStream(currentSessionId);
      } else {
        setActiveSessionId((current) => (current === input.displaySessionId ? null : current));
      }
      setStreamingState((current) =>
        current?.sessionId === currentSessionId || current?.sessionId === input.displaySessionId ? null : current,
      );
      if (responseAbortControllerRef.current === abortController) {
        responseAbortControllerRef.current = null;
      }
    }
  }

  async function handleCancelResponse() {
    const responseId = streamingState?.responseId;
    if (!responseId) {
      setSendError("响应尚未创建，暂时无法中断。");
      return;
    }
    if (!api.cancelResponse) {
      setSendError("当前 API 客户端未配置 Responses 中断接口。");
      return;
    }

    setSendError(undefined);
    setStreamingState((current) => (current ? { ...current, isCancelling: true } : current));
    try {
      await api.cancelResponse(responseId);
      responseAbortControllerRef.current?.abort();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "中断 opencode 响应失败。");
      setStreamingState((current) => (current ? { ...current, isCancelling: false } : current));
    }
  }

  async function handleReplyQuestion(requestId: string, answers: ApiQuestionAnswer[]) {
    if (!api.replyQuestion) {
      setSendError("当前 API 客户端未配置 question 回复接口。");
      return;
    }

    setSendError(undefined);
    setQuestionSubmissionById((current) => ({ ...current, [requestId]: "replying" }));
    try {
      await api.replyQuestion(requestId, answers);
      setPendingQuestionsById((current) => omitRecordKey(current, requestId));
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "提交 question 回复失败。");
    } finally {
      setQuestionSubmissionById((current) => omitRecordKey(current, requestId));
    }
  }

  async function handleRejectQuestion(requestId: string) {
    if (!api.rejectQuestion) {
      setSendError("当前 API 客户端未配置 question 拒绝接口。");
      return;
    }

    setSendError(undefined);
    setQuestionSubmissionById((current) => ({ ...current, [requestId]: "rejecting" }));
    try {
      await api.rejectQuestion(requestId);
      setPendingQuestionsById((current) => omitRecordKey(current, requestId));
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "拒绝 question 请求失败。");
    } finally {
      setQuestionSubmissionById((current) => omitRecordKey(current, requestId));
    }
  }

  async function refreshSessionAfterStream(sessionId: string) {
    try {
      const nextDetail = await api.getSession(sessionId);
      setSessions((current) => upsertSessionSummary(current, toSessionSummary(nextDetail)));
      setSessionDetailsById((current) => ({
        ...current,
        [nextDetail.id]: nextDetail,
      }));
    } catch (error) {
      setSendError((current) => current ?? (error instanceof Error ? error.message : "无法刷新会话详情。"));
    }
  }

  async function refreshPendingQuestions(isActive: () => boolean = () => true) {
    if (!api.listQuestions) return;

    try {
      const questions = await api.listQuestions();
      if (!isActive()) return;
      setPendingQuestionsById(indexQuestionsById(questions));
    } catch (error) {
      if (!isActive()) return;
      setSendError(error instanceof Error ? error.message : "无法加载待回答的 opencode 问题。");
    }
  }

  function handleResponseStreamEvent(sessionId: string, event: ApiStreamEvent) {
    const type = streamEventType(event);
    const data = objectRecord(event.data);

    if (type === "response.created") {
      const responseId = data ? stringField(data, "id") : undefined;
      const nextSessionId = data ? conversationIdFromResponse(data) ?? sessionId : sessionId;
      setActiveSessionId((current) => (current === sessionId ? nextSessionId : current));
      if (!isLocalSessionId(nextSessionId)) {
        setSessions((current) => ensureResponseSession(current, nextSessionId, sessionId));
      }
      setStreamingState((current) =>
        current?.sessionId === sessionId ? { ...current, responseId, sessionId: nextSessionId } : current,
      );
      return nextSessionId === sessionId ? undefined : nextSessionId;
    }

    if (type === "response.completed" || type === "response.cancelled" || type === "response.failed") {
      const status: SessionStatus = type === "response.failed" ? "error" : "ready";
      setSessions((current) => markSessionStatus(current, sessionId, status));
      setStreamingState((current) =>
        current?.sessionId === sessionId
          ? {
              ...current,
              assistantMessage: { ...current.assistantMessage, isStreaming: false },
              isCancelling: false,
            }
          : current,
      );
      if (type === "response.failed") {
        setSendError(errorMessageFromEvent(data) ?? "opencode 响应失败。");
      }
      return;
    }

    if (type === "question.asked") {
      const question = questionRequestFromEvent(event.data);
      if (!question) {
        setSendError("opencode question.asked 事件格式无效。");
        return;
      }
      setPendingQuestionsById((current) => ({ ...current, [question.id]: question }));
      return;
    }

    if (type === "question.replied" || type === "question.rejected") {
      const requestId = questionRequestIdFromEvent(event.data);
      if (requestId) {
        setPendingQuestionsById((current) => omitRecordKey(current, requestId));
        setQuestionSubmissionById((current) => omitRecordKey(current, requestId));
      }
      return;
    }

    if (!eventTargetsSession(event.data, sessionId)) return;

    if (type === "message.updated") {
      const message = messageInfoFromEvent(event.data);
      if (message) {
        setStreamingState((current) =>
          current?.sessionId === sessionId
            ? {
                ...current,
                messageRolesById: {
                  ...current.messageRolesById,
                  [message.id]: message.role,
                },
              }
            : current,
        );
      }
      return;
    }

    if (type === "message.part.updated" || type === "message.part.delta") {
      const update = textUpdateFromEvent(event.data);
      if (update) {
        setStreamingState((current) => {
          if (current?.sessionId !== sessionId) return current;
          const role = update.role ?? (update.messageId ? current.messageRolesById[update.messageId] : undefined);
          if (role !== "assistant") return current;
          const content =
            update.mode === "append" ? `${current.assistantMessage.content}${update.text}` : update.text;
          return {
            ...current,
            assistantMessage: { ...current.assistantMessage, content, isStreaming: true },
          };
        });
      }
    } else if (type === "session.updated") {
      applySessionUpdate(event.data);
    } else if (type === "session.idle") {
      setSessions((current) => markSessionStatus(current, sessionId, "ready"));
    } else if (type === "session.error") {
      setSessions((current) => markSessionStatus(current, sessionId, "error"));
      setSendError(errorMessageFromEvent(data) ?? "opencode 会话执行失败。");
    } else if (type === "session.status") {
      const status = statusFromEvent(event.data);
      if (status) setSessions((current) => markSessionStatus(current, sessionId, status));
    }
  }

  function applySessionUpdate(eventData: unknown) {
    const info = sessionInfoFromEvent(eventData);
    const id = info ? stringField(info, "id") : undefined;
    if (!id) return;

    const title = info ? stringField(info, "title") : undefined;
    const updatedAt = updatedAtFromSessionInfo(info);
    setSessions((current) => updateSessionSummary(current, id, { title, updatedAt }));
    setSessionDetailsById((current) => updateSessionDetail(current, id, { title, updatedAt }));
  }

  async function handleSignOut() {
    responseAbortControllerRef.current?.abort();
    responseAbortControllerRef.current = null;
    await api.logout();
    setActiveSessionId(null);
    setActiveView("chat");
    setAuthError(undefined);
    setPendingFiles([]);
    setPendingFileIds([]);
    setPendingQuestionsById({});
    setQuestionSubmissionById({});
    setSendError(undefined);
    setModelCatalog(emptyModelCatalog);
    setModelLoadError(undefined);
    setModelSelection({ modelID: "", providerID: "" });
    setSessionDetailsById({});
    setSessions([]);
    setStreamingState(null);
    setUser(null);
  }

  function handleSelectSession(sessionId: string) {
    setSendError(undefined);
    setActiveView("chat");
    setActiveSessionId(sessionId);
  }

  async function handleRetry() {
    if (!user) return;
    setSendError(undefined);
    try {
      const nextSessions = await api.listSessions();
      setSessions(nextSessions);
      setSessionDetailsById((current) => keepExistingSessionDetails(current, nextSessions));
      setActiveSessionId((current) =>
        current && nextSessions.some((session) => session.id === current) ? current : null,
      );
      void refreshPendingQuestions();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "无法加载会话历史。");
    }
  }

  async function loadModelCatalog(isActive: () => boolean = () => true) {
    if (!api.listModels) {
      if (!isActive()) return;
      setModelCatalog(emptyModelCatalog);
      setModelLoadError("当前 API 客户端未配置模型列表接口。");
      return;
    }

    setIsLoadingModels(true);
    setModelLoadError(undefined);
    try {
      const catalog = toModelCatalogView(await api.listModels());
      if (!isActive()) return;
      setModelCatalog(catalog);
      setModelSelection((current) =>
        hasModelSelection(current) && !catalogHasModel(catalog, current)
          ? { modelID: "", providerID: "" }
          : current,
      );
    } catch (error) {
      if (!isActive()) return;
      setModelCatalog(emptyModelCatalog);
      setModelLoadError(error instanceof Error ? error.message : "无法加载 opencode 模型列表。");
    } finally {
      if (isActive()) setIsLoadingModels(false);
    }
  }

  if (isCheckingAuth) {
    return <div className="auth-shell"><p className="eyebrow">正在加载工作区</p></div>;
  }

  if (!model) {
    return (
      <AuthScreen
        error={authError}
        isSubmitting={isSubmittingAuth}
        onModeChange={() => setAuthError(undefined)}
        onSubmit={handleAuth}
      />
    );
  }

  return (
    <WorkspaceApp
      activeView={activeView}
      model={model}
      onAttachFiles={handleAttachFiles}
      onCancelResponse={handleCancelResponse}
      onCreateSession={handleCreateSession}
      onOpenChat={() => setActiveView("chat")}
      onOpenVideoTasks={() => setActiveView("videoTasks")}
      onModelSelectionChange={setModelSelection}
      onRejectQuestion={handleRejectQuestion}
      onRetry={handleRetry}
      onReplyQuestion={handleReplyQuestion}
      onSelectSession={handleSelectSession}
      onSignOut={handleSignOut}
      onSendMessage={handleSendMessage}
      videoTasksContent={<VideoTaskCenter api={api} />}
    />
  );
}

/**
 * 将 API 会话摘要转换成侧边栏视图模型。
 */
function toSessionView(session: ApiSession) {
  return {
    id: session.id,
    status: session.status,
    title: session.title,
    updatedAtLabel: formatUpdatedAt(session.updatedAt),
  };
}

function toSessionSummary(session: ApiSessionDetail): ApiSession {
  return {
    files: session.files,
    id: session.id,
    status: session.status,
    title: session.title,
    updatedAt: session.updatedAt,
  };
}

function upsertSessionSummary(sessions: ApiSession[], nextSession: ApiSession) {
  return [nextSession, ...sessions.filter((session) => session.id !== nextSession.id)].sort(compareSessionUpdatedAtDesc);
}

function compareSessionUpdatedAtDesc(left: ApiSession, right: ApiSession) {
  return timestampOrZero(right.updatedAt) - timestampOrZero(left.updatedAt);
}

function timestampOrZero(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * 将 API 消息详情转换成聊天列表视图模型。
 */
function toMessageView(message: ApiSessionDetail["messages"][number]) {
  return {
    content: message.content,
    createdAtLabel: formatTime(new Date(message.createdAt)),
    files: message.files.map(toFileView),
    id: message.id,
    role: message.role,
  };
}

function messageCreatedBefore(message: ApiSessionDetail["messages"][number], timestamp: number) {
  const createdAt = new Date(message.createdAt).getTime();
  return !Number.isFinite(createdAt) || createdAt < timestamp;
}

/**
 * 将 opencode question 请求转换为聊天区交互卡片视图。
 */
function toQuestionRequestView(
  question: ApiQuestionRequest,
  submissionStatus: QuestionSubmissionStatus | undefined,
): QuestionRequestView {
  return {
    id: question.id,
    questions: question.questions.map((item) => ({
      custom: item.custom,
      header: item.header,
      multiple: item.multiple,
      options: item.options.map((option) => ({
        description: option.description,
        label: option.label,
      })),
      question: item.question,
    })),
    sessionID: question.sessionID,
    submissionStatus,
    tool: question.tool,
  };
}

/**
 * 新建会话没有历史消息，用空详情占位，避免触发无意义详情请求。
 */
function toEmptySessionDetail(session: ApiSession): ApiSessionDetail {
  return {
    ...session,
    messages: [],
  };
}

/**
 * 将 `/v1/models` 响应转换成 Composer 使用的分组视图。
 */
function toModelCatalogView(catalog: ApiModelCatalog): ModelCatalogView {
  const providers = catalog.providers.map((provider) => ({
    defaultModelID: provider.defaultModelID,
    id: provider.id,
    name: provider.name,
    models: provider.models.map((model) => ({
      contextWindow: model.contextWindow,
      id: model.id,
      isDefault: model.isDefault,
      modelID: model.modelID,
      name: model.name,
      outputLimit: model.outputLimit,
      providerID: model.providerID,
      providerName: model.providerName,
      supportsAttachments: model.supportsAttachments,
      supportsReasoning: model.supportsReasoning,
      supportsTools: model.supportsTools,
    })),
  }));

  return {
    defaultModelIDs: catalog.default,
    models: providers.flatMap((provider) => provider.models),
    providers,
  };
}

function hasModelSelection(model: ModelSelectionView) {
  return Boolean(model.providerID.trim() && model.modelID.trim());
}

function catalogHasModel(catalog: ModelCatalogView, model: ModelSelectionView) {
  return catalog.models.some(
    (candidate) => candidate.providerID === model.providerID && candidate.modelID === model.modelID,
  );
}

/**
 * 流式响应期间先更新摘要状态，结束后再用后端会话详情覆盖最终状态。
 */
function markSessionStatus(sessions: ApiSession[], sessionId: string, status: SessionStatus) {
  return sessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          status,
          updatedAt: new Date().toISOString(),
        }
      : session,
  );
}

function ensureResponseSession(sessions: ApiSession[], nextSessionId: string, previousSessionId: string) {
  const updatedAt = new Date().toISOString();
  const previousIsLocal = isLocalSessionId(previousSessionId);
  const existing = sessions.find((session) => session.id === nextSessionId);
  if (existing) {
    return sessions
      .filter((session) => !previousIsLocal || session.id !== previousSessionId)
      .map((session) => (session.id === nextSessionId ? { ...session, status: "thinking" as const, updatedAt } : session));
  }

  return [
    {
      files: [],
      id: nextSessionId,
      status: "thinking" as const,
      title: "未命名会话",
      updatedAt,
    },
    ...sessions.filter((session) => !previousIsLocal || session.id !== previousSessionId),
  ];
}

function updateSessionSummary(
  sessions: ApiSession[],
  sessionId: string,
  patch: { title?: string; updatedAt?: string },
) {
  return sessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          title: patch.title ?? session.title,
          updatedAt: patch.updatedAt ?? session.updatedAt,
        }
      : session,
  );
}

function updateSessionDetail(
  current: Record<string, ApiSessionDetail>,
  sessionId: string,
  patch: { title?: string; updatedAt?: string },
) {
  const detail = current[sessionId];
  if (!detail) return current;
  return {
    ...current,
    [sessionId]: {
      ...detail,
      title: patch.title ?? detail.title,
      updatedAt: patch.updatedAt ?? detail.updatedAt,
    },
  };
}

/**
 * 前端只传 opencode SDK 支持的 model 对象；两个字段必须同时存在。
 */
function toApiModelSelection(model: ModelSelectionView): ApiModelSelection | undefined {
  const providerID = model.providerID.trim();
  const modelID = model.modelID.trim();
  if (!providerID && !modelID) return undefined;
  if (!providerID || !modelID) throw new Error("请同时填写 Provider ID 和 Model ID。");
  return { modelID, providerID };
}

function createStreamingMessages(text: string, files: FileAttachmentView[]) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdAtLabel = formatTime(new Date());
  return {
    assistantMessage: {
      content: "",
      createdAtLabel,
      files: [],
      id: `local-assistant-${suffix}`,
      isStreaming: true,
      role: "assistant" as const,
    },
    userMessage: {
      content: text,
      createdAtLabel,
      files,
      id: `local-user-${suffix}`,
      role: "user" as const,
    },
  };
}

function createLocalSessionId() {
  return `${LOCAL_SESSION_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isLocalSessionId(sessionId: string) {
  return sessionId.startsWith(LOCAL_SESSION_PREFIX);
}

function conversationIdFromResponse(response: Record<string, unknown>) {
  const conversation = objectField(response, "conversation");
  return conversation ? stringField(conversation, "id") : undefined;
}

function streamEventType(event: ApiStreamEvent) {
  const data = objectRecord(event.data);
  return (data ? stringField(data, "type") : undefined) ?? event.event;
}

function questionRequestFromEvent(eventData: unknown): ApiQuestionRequest | undefined {
  const properties = propertiesFromEvent(eventData);
  if (!properties) return undefined;

  const id = stringField(properties, "id");
  const sessionID = stringField(properties, "sessionID") ?? stringField(properties, "sessionId");
  const rawQuestions = arrayField(properties, "questions");
  if (!id || !sessionID || !rawQuestions) return undefined;

  const questions = rawQuestions.map(questionInfoFromEvent).filter((question): question is ApiQuestionInfo => Boolean(question));
  if (questions.length !== rawQuestions.length) return undefined;

  const rawTool = objectField(properties, "tool");
  const messageID = rawTool ? stringField(rawTool, "messageID") : undefined;
  const callID = rawTool ? stringField(rawTool, "callID") : undefined;

  return {
    id,
    questions,
    sessionID,
    tool: messageID && callID ? { callID, messageID } : undefined,
  };
}

function questionInfoFromEvent(value: unknown): ApiQuestionInfo | undefined {
  const question = objectRecord(value);
  if (!question) return undefined;

  const text = stringField(question, "question");
  const header = stringField(question, "header");
  const rawOptions = arrayField(question, "options") ?? [];
  if (!text || !header) return undefined;

  const options = rawOptions
    .map((option) => {
      const optionRecord = objectRecord(option);
      const label = optionRecord ? stringField(optionRecord, "label") : undefined;
      const description = optionRecord ? stringField(optionRecord, "description") : undefined;
      return label && description ? { description, label } : undefined;
    })
    .filter((option): option is ApiQuestionInfo["options"][number] => Boolean(option));
  if (options.length !== rawOptions.length) return undefined;

  return {
    custom: booleanField(question, "custom"),
    header,
    multiple: booleanField(question, "multiple"),
    options,
    question: text,
  };
}

function questionRequestIdFromEvent(eventData: unknown) {
  const properties = propertiesFromEvent(eventData);
  return properties ? stringField(properties, "requestID") ?? stringField(properties, "id") : undefined;
}

function eventTargetsSession(eventData: unknown, sessionId: string) {
  const properties = propertiesFromEvent(eventData);
  const info = properties ? objectField(properties, "info") : undefined;
  const part = properties ? objectField(properties, "part") : undefined;
  const message = properties ? objectField(properties, "message") : undefined;
  const sessionID =
    (properties ? stringField(properties, "sessionID") ?? stringField(properties, "sessionId") : undefined) ??
    (info ? stringField(info, "sessionID") ?? stringField(info, "sessionId") : undefined) ??
    (part ? stringField(part, "sessionID") ?? stringField(part, "sessionId") : undefined) ??
    (message ? stringField(message, "sessionID") ?? stringField(message, "sessionId") : undefined);
  return !sessionID || sessionID === sessionId;
}

function statusFromEvent(eventData: unknown): SessionStatus | undefined {
  const properties = propertiesFromEvent(eventData);
  const status = properties
    ? objectField(properties, "status") ?? objectField(properties, "info") ?? properties
    : undefined;
  const type = status ? stringField(status, "type") : undefined;
  if (type === "idle") return "ready";
  if (type === "busy") return "thinking";
  if (type === "retry") return "error";
  return undefined;
}

function messageInfoFromEvent(eventData: unknown): { id: string; role: ChatMessageView["role"] } | undefined {
  const properties = propertiesFromEvent(eventData);
  const info = properties ? objectField(properties, "info") : undefined;
  if (!info) return undefined;

  const id = stringField(info, "id");
  const role = messageRoleFromRecord(info);
  return id && role ? { id, role } : undefined;
}

function messageRoleFromRecord(value: Record<string, unknown>) {
  const role = stringField(value, "role");
  return role === "assistant" || role === "user" || role === "system" ? role : undefined;
}

function textUpdateFromEvent(
  eventData: unknown,
): { messageId?: string; mode: "append" | "replace"; role?: ChatMessageView["role"]; text: string } | undefined {
  const properties = propertiesFromEvent(eventData);
  if (!properties) return undefined;

  const field = stringField(properties, "field");
  if (field && field !== "text") return undefined;

  const messageId = stringField(properties, "messageID") ?? stringField(properties, "messageId");
  const role = messageRoleFromRecord(properties);

  const directDelta = stringField(properties, "delta");
  if (directDelta !== undefined) return { messageId, mode: "append", role, text: directDelta };

  const part = objectField(properties, "part");
  const partMessageId = part ? stringField(part, "messageID") ?? stringField(part, "messageId") : undefined;
  const partRole = part ? messageRoleFromRecord(part) : undefined;
  const partDelta = part ? stringField(part, "delta") : undefined;
  if (partDelta !== undefined) {
    return { messageId: partMessageId ?? messageId, mode: "append", role: partRole ?? role, text: partDelta };
  }

  const partText = part && isTextPartRecord(part) ? stringField(part, "text") : undefined;
  if (partText !== undefined) {
    return { messageId: partMessageId ?? messageId, mode: "replace", role: partRole ?? role, text: partText };
  }

  const text = stringField(properties, "text");
  if (text !== undefined) return { messageId, mode: "replace", role, text };

  const message = objectField(properties, "message");
  const messageInfo = message ? objectField(message, "info") : undefined;
  const messageIdFromMessage =
    messageInfo ? stringField(messageInfo, "id") : message ? stringField(message, "id") : undefined;
  const messageRole =
    (messageInfo ? messageRoleFromRecord(messageInfo) : undefined) ?? (message ? messageRoleFromRecord(message) : undefined);
  const messageText = message ? textFromParts(arrayField(message, "parts")) : undefined;
  if (messageText !== undefined) {
    return {
      messageId: messageIdFromMessage ?? messageId,
      mode: "replace",
      role: messageRole ?? role,
      text: messageText,
    };
  }

  const partsText = textFromParts(arrayField(properties, "parts"));
  return partsText === undefined ? undefined : { messageId, mode: "replace", role, text: partsText };
}

function textFromParts(parts: unknown[] | undefined) {
  if (!parts) return undefined;
  const text = parts
    .map((part) => {
      const partRecord = objectRecord(part);
      return partRecord && isTextPartRecord(partRecord) ? stringField(partRecord, "text") : undefined;
    })
    .filter((partText): partText is string => partText !== undefined)
    .join("\n")
    .trim();
  return text || undefined;
}

function sessionInfoFromEvent(eventData: unknown) {
  const properties = propertiesFromEvent(eventData);
  return properties ? objectField(properties, "info") ?? objectField(properties, "session") : undefined;
}

function updatedAtFromSessionInfo(info: Record<string, unknown> | undefined) {
  const time = info ? objectField(info, "time") : undefined;
  const value = time ? numberField(time, "updated") ?? numberField(time, "created") : undefined;
  if (value === undefined) return undefined;
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
  return new Date(milliseconds).toISOString();
}

function errorMessageFromEvent(eventData: Record<string, unknown> | undefined) {
  if (!eventData) return undefined;
  const error = objectField(eventData, "error");
  const properties = objectField(eventData, "properties");
  return (
    (error ? stringField(error, "message") : undefined) ??
    (properties ? stringField(properties, "message") : undefined) ??
    stringField(eventData, "message")
  );
}

function propertiesFromEvent(eventData: unknown) {
  const event = objectRecord(eventData);
  return event ? objectField(event, "properties") ?? event : undefined;
}

function isTextPartRecord(part: Record<string, unknown>) {
  const type = stringField(part, "type");
  return type === undefined || type === "text";
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function objectField(value: Record<string, unknown>, field: string) {
  return objectRecord(value[field]);
}

function arrayField(value: Record<string, unknown>, field: string) {
  const candidate = value[field];
  return Array.isArray(candidate) ? candidate : undefined;
}

function stringField(value: Record<string, unknown>, field: string) {
  const candidate = value[field];
  return typeof candidate === "string" ? candidate : undefined;
}

function numberField(value: Record<string, unknown>, field: string) {
  const candidate = value[field];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

function booleanField(value: Record<string, unknown>, field: string) {
  const candidate = value[field];
  return typeof candidate === "boolean" ? candidate : undefined;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function indexQuestionsById(questions: ApiQuestionRequest[]) {
  return Object.fromEntries(questions.map((question) => [question.id, question]));
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * 刷新历史摘要后，丢弃已不存在会话的详情缓存。
 */
function keepExistingSessionDetails(current: Record<string, ApiSessionDetail>, sessions: ApiSession[]) {
  const sessionIds = new Set(sessions.map((session) => session.id));
  return Object.fromEntries(Object.entries(current).filter(([sessionId]) => sessionIds.has(sessionId)));
}

/**
 * 将上传文件响应转换成 composer 和消息附件共用的视图结构。
 */
function toFileView(file: ApiFile): FileAttachmentView {
  return {
    id: file.id,
    kind: file.kind,
    name: file.name,
    sizeLabel: formatBytes(file.size),
    status: "ready",
  };
}

/**
 * 根据 MIME 类型推断文件分类，保持上传前临时卡片和后端分类一致。
 */
function kindFromMime(mimeType: string): FileKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "text/csv" || mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return "spreadsheet";
  }
  if (mimeType.startsWith("text/") || mimeType.includes("pdf") || mimeType.includes("document")) {
    return "document";
  }
  return "other";
}

/**
 * 将字节数转换成紧凑的人类可读大小。
 */
function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: Date) {
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 将 ISO 更新时间转换成侧边栏相对时间标签。
 */
function formatUpdatedAt(value: string) {
  const updatedAt = new Date(value).getTime();
  if (!Number.isFinite(updatedAt)) return "未知时间";

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000));
  if (elapsedMinutes < 1) return "刚刚";
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} 小时前`;

  return new Date(value).toLocaleDateString();
}
