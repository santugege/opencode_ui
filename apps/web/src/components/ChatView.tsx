import { AlertCircle, Bot, RotateCcw, UserRound } from "lucide-react";
import { FileCard } from "./FileCard";
import type { ChatMessageView, SessionListItemView } from "../types";

const statusLabel = {
  ready: "Ready",
  thinking: "Thinking",
  running_tool: "Running tool",
  error: "Error",
} satisfies Record<SessionListItemView["status"], string>;

interface ChatViewProps {
  activeSession: SessionListItemView | null;
  error?: string;
  messages: ChatMessageView[];
  onRetry?: () => void;
}

export function ChatView({ activeSession, error, messages, onRetry }: ChatViewProps) {
  return (
    <section className="chat" aria-label="Chat workspace">
      <header className="chat__header">
        <div>
          <p className="eyebrow">Session</p>
          <h2>{activeSession?.title ?? "Untitled session"}</h2>
        </div>
        <span className={`status-pill status-pill--${activeSession?.status ?? "ready"}`}>
          {statusLabel[activeSession?.status ?? "ready"]}
        </span>
      </header>

      {error ? (
        <div className="chat__error" role="alert">
          <AlertCircle size={17} strokeWidth={1.9} />
          <span>{error}</span>
          <button onClick={onRetry} type="button">
            <RotateCcw size={14} strokeWidth={2} />
            Retry opencode request
          </button>
        </div>
      ) : null}

      <div className="chat__scroll">
        {messages.length === 0 ? (
          <EmptySession />
        ) : (
          <ol className="message-list">
            {messages.map((message) => (
              <li className={`message message--${message.role}`} key={message.id}>
                <span className="message__avatar" aria-hidden="true">
                  {message.role === "assistant" ? (
                    <Bot size={16} strokeWidth={1.9} />
                  ) : (
                    <UserRound size={16} strokeWidth={1.9} />
                  )}
                </span>
                <div className="message__content">
                  <div className="message__meta">
                    <strong>{message.role === "assistant" ? "Opencode" : "You"}</strong>
                    <span>{message.createdAtLabel}</span>
                  </div>
                  <p>{message.content}</p>
                  {message.files.length > 0 ? (
                    <div className="message__files">
                      {message.files.map((file) => (
                        <FileCard file={file} key={file.id} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function EmptySession() {
  return (
    <div className="empty-state">
      <div className="empty-state__mark" aria-hidden="true">
        <Bot size={26} strokeWidth={1.65} />
      </div>
      <h2>Untitled session</h2>
      <p>Ask anything, attach files, and opencode will work inside this isolated session.</p>
    </div>
  );
}
