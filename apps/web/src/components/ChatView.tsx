import { AlertCircle, Bot, RotateCcw, Square, UserRound } from "lucide-react";
import { FileCard } from "./FileCard";
import { MessageMarkdown } from "./MessageMarkdown";
import { QuestionRequestCard } from "./QuestionRequestCard";
import type { ChatMessageView, QuestionAnswerView, QuestionRequestView, SessionListItemView } from "../types";

const statusLabel = {
  ready: "就绪",
  thinking: "思考中",
  running_tool: "运行工具中",
  error: "错误",
} satisfies Record<SessionListItemView["status"], string>;

interface ChatViewProps {
  activeSession: SessionListItemView | null;
  error?: string;
  isCancelling?: boolean;
  isStreaming?: boolean;
  messages: ChatMessageView[];
  onCancelResponse?: () => void;
  onRejectQuestion?: (requestId: string) => Promise<void> | void;
  onRetry?: () => void;
  onReplyQuestion?: (requestId: string, answers: QuestionAnswerView[]) => Promise<void> | void;
  pendingQuestions?: QuestionRequestView[];
}

export function ChatView({
  activeSession,
  error,
  isCancelling = false,
  isStreaming = false,
  messages,
  onCancelResponse,
  onRejectQuestion,
  onRetry,
  onReplyQuestion,
  pendingQuestions = [],
}: ChatViewProps) {
  const hasConversationItems = messages.length > 0 || pendingQuestions.length > 0;

  return (
    <section className="chat" aria-label="聊天工作区">
      <header className="chat__header">
        <div>
          <p className="eyebrow">会话</p>
          <h2>{activeSession?.title ?? "未命名会话"}</h2>
        </div>
        <div className="chat__header-actions">
          <span className={`status-pill status-pill--${activeSession?.status ?? "ready"}`}>
            {statusLabel[activeSession?.status ?? "ready"]}
          </span>
          {isStreaming ? (
            <button className="chat__stop" disabled={isCancelling} onClick={onCancelResponse} type="button">
              <Square size={13} strokeWidth={2.2} />
              {isCancelling ? "停止中" : "停止"}
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="chat__error" role="alert">
          <AlertCircle size={17} strokeWidth={1.9} />
          <span>{error}</span>
          {onRetry ? (
            <button onClick={onRetry} type="button">
              <RotateCcw size={14} strokeWidth={2} />
              重试 opencode 请求
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="chat__scroll">
        {!hasConversationItems ? (
          <EmptySession />
        ) : (
          <ol aria-live="polite" className="message-list">
            {messages.map((message) => (
              <li
                className={`message message--${message.role}${message.isStreaming ? " message--streaming" : ""}`}
                key={message.id}
              >
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
                  <MessageMarkdown content={message.content} isStreaming={message.isStreaming} />
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
            {pendingQuestions.map((request) => (
              <li className="message message--assistant message--question" key={request.id}>
                <span className="message__avatar" aria-hidden="true">
                  <Bot size={16} strokeWidth={1.9} />
                </span>
                <div className="message__content">
                  <div className="message__meta">
                    <strong>Opencode</strong>
                    <span>等待选择</span>
                  </div>
                  <QuestionRequestCard onReject={onRejectQuestion} onReply={onReplyQuestion} request={request} />
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
