import { useEffect, useMemo, useState } from "react";
import type { FileKind } from "@opencode-ui/shared";
import { browserApi, type ApiClient, type ApiFile, type ApiSession } from "./api";
import { AuthScreen } from "./components/AuthScreen";
import { ChatView } from "./components/ChatView";
import { Composer } from "./components/Composer";
import { SessionSidebar } from "./components/SessionSidebar";
import type { FileAttachmentView, WorkspaceViewModel } from "./types";
import "./styles.css";

export interface WorkspaceAppProps {
  model?: WorkspaceViewModel;
  onAttachFiles?: (files: File[]) => void;
  onCreateSession?: () => void;
  onRetry?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onSignOut?: () => void;
  onSendMessage?: (text: string) => void;
}

const defaultModel: WorkspaceViewModel = {
  user: {
    email: "demo@example.com",
  },
  sessions: [
    {
      id: "session-chat",
      title: "Document review",
      status: "thinking",
      updatedAtLabel: "Now",
    },
    {
      id: "session-empty",
      title: "Untitled session",
      status: "ready",
      updatedAtLabel: "12m ago",
    },
    {
      id: "session-error",
      title: "Video notes",
      status: "error",
      updatedAtLabel: "Yesterday",
    },
  ],
  activeSessionId: "session-chat",
  messages: [
    {
      id: "message-demo-1",
      role: "user",
      content: "Compare these notes and tell me what needs follow-up before the review.",
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
      content: "I found four open questions, two missing owners, and one section that needs a source before you share it.",
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
};

export function WorkspaceApp({
  model = defaultModel,
  onAttachFiles,
  onCreateSession,
  onRetry,
  onSelectSession,
  onSignOut,
  onSendMessage,
}: WorkspaceAppProps) {
  const activeSession =
    model.sessions.find((session) => session.id === model.activeSessionId) ?? null;

  return (
    <main className="app-shell">
      <SessionSidebar
        activeSessionId={model.activeSessionId}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        onSignOut={onSignOut}
        sessions={model.sessions}
        user={model.user}
      />
      <div className="workspace">
        <ChatView
          activeSession={activeSession}
          error={model.error}
          messages={model.messages}
          onRetry={onRetry}
        />
        <Composer files={model.composerFiles} onAttachFiles={onAttachFiles} onSendMessage={onSendMessage} />
      </div>
    </main>
  );
}

interface AppProps {
  api?: ApiClient;
}

export default function App({ api = browserApi }: AppProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | undefined>();
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [pendingFiles, setPendingFiles] = useState<FileAttachmentView[]>([]);
  const [pendingFileIds, setPendingFileIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [user, setUser] = useState<{ email: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    api.me()
      .then(async (result) => {
        if (!isMounted) return;
        if (result?.user) {
          setUser(result.user);
          const nextSessions = await api.listSessions();
          if (!isMounted) return;
          setSessions(nextSessions);
          setActiveSessionId(nextSessions[0]?.id ?? null);
        }
      })
      .finally(() => {
        if (isMounted) setIsCheckingAuth(false);
      });
    return () => {
      isMounted = false;
    };
  }, [api]);

  const model = useMemo<WorkspaceViewModel | null>(() => {
    if (!user) return null;
    const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
    return {
      activeSessionId,
      composerFiles: pendingFiles,
      messages: activeSession?.messages.map(toMessageView) ?? [],
      sessions: sessions.map(toSessionView),
      user,
    };
  }, [activeSessionId, pendingFiles, sessions, user]);

  async function handleAuth(input: { email: string; password: string }) {
    setAuthError(undefined);
    setIsSubmittingAuth(true);
    try {
      const result = await api.register(input);
      setUser(result.user);
      const nextSessions = await api.listSessions();
      setSessions(nextSessions);
      setActiveSessionId(nextSessions[0]?.id ?? null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleCreateSession() {
    const session = await api.createSession({ title: "Untitled session" });
    setSessions((current) => [session, ...current.filter((candidate) => candidate.id !== session.id)]);
    setActiveSessionId(session.id);
    setPendingFiles([]);
    setPendingFileIds([]);
  }

  async function handleAttachFiles(files: File[]) {
    if (!activeSessionId) {
      const session = await api.createSession({ title: "Untitled session" });
      setSessions((current) => [session, ...current]);
      setActiveSessionId(session.id);
      await uploadFiles(session.id, files);
      return;
    }
    await uploadFiles(activeSessionId, files);
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
      const uploaded = await api.uploadFile(sessionId, file);
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
    }
  }

  async function handleSendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !activeSessionId) return;
    const result = await api.sendMessage(activeSessionId, {
      fileIds: pendingFileIds,
      text: trimmed,
    });
    setSessions((current) =>
      current.map((session) => (session.id === activeSessionId ? result.session : session)),
    );
    setActiveSessionId(result.session.id);
    setPendingFiles([]);
    setPendingFileIds([]);
  }

  async function handleSignOut() {
    await api.logout();
    setActiveSessionId(null);
    setAuthError(undefined);
    setPendingFiles([]);
    setPendingFileIds([]);
    setSessions([]);
    setUser(null);
  }

  if (isCheckingAuth) {
    return <div className="auth-shell"><p className="eyebrow">Loading workspace</p></div>;
  }

  if (!model) {
    return <AuthScreen error={authError} isSubmitting={isSubmittingAuth} onSubmit={handleAuth} />;
  }

  return (
    <WorkspaceApp
      model={model}
      onAttachFiles={handleAttachFiles}
      onCreateSession={handleCreateSession}
      onSelectSession={setActiveSessionId}
      onSignOut={handleSignOut}
      onSendMessage={handleSendMessage}
    />
  );
}

function toSessionView(session: ApiSession) {
  return {
    id: session.id,
    status: session.status,
    title: session.title,
    updatedAtLabel: "Now",
  };
}

function toMessageView(message: ApiSession["messages"][number]) {
  return {
    content: message.content,
    createdAtLabel: new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    files: message.files.map(toFileView),
    id: message.id,
    role: message.role,
  };
}

function toFileView(file: ApiFile): FileAttachmentView {
  return {
    id: file.id,
    kind: file.kind,
    name: file.name,
    sizeLabel: formatBytes(file.size),
    status: "ready",
  };
}

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

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
