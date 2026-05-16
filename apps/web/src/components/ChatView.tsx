import { AlertCircle, Bot, RotateCcw, UserRound } from "lucide-react";
import { FileCard } from "./FileCard";
import type { ChatMessageView, SessionListItemView } from "../types";

const statusLabel = {
  ready: "就绪",
  thinking: "思考中",
  running_tool: "运行工具中",
  error: "错误",
} satisfies Record<SessionListItemView["status"], string>;

interface ChatViewProps {
  activeSession: SessionListItemView | null;
  error?: string;
  messages: ChatMessageView[];
  onRetry?: () => void;
}

export function ChatView({ activeSession, error, messages, onRetry }: ChatViewProps) {
  return (
    <section className="chat" aria-label="聊天工作区">
      <header className="chat__header">
        <div>
          <p className="eyebrow">会话</p>
          <h2>{activeSession?.title ?? "未命名会话"}</h2>
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
            重试 opencode 请求
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
                    <strong>{message.role === "assistant" ? "Opencode" : "你"}</strong>
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
      <h2>未命名会话</h2>
      <p>输入问题、附加文件，opencode 会在这个独立会话中工作。</p>
    </div>
  );
}
