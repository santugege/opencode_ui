import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

const markdownComponents = {
  a({ children, href, node: _node, ...props }) {
    const opensNewTab = href ? /^https?:\/\//i.test(href) : false;
    return (
      <a
        {...props}
        href={href}
        rel={opensNewTab ? "noreferrer" : undefined}
        target={opensNewTab ? "_blank" : undefined}
      >
        {children}
      </a>
    );
  },
} satisfies Components;

export function MessageMarkdown({ content, isStreaming = false }: MessageMarkdownProps) {
  if (!content) {
    return isStreaming ? (
      <p className="message__empty">
        <span className="message__stream-placeholder">正在等待 opencode 响应...</span>
      </p>
    ) : null;
  }

  return (
    <div className="message__markdown">
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
      {isStreaming ? <span className="message__cursor" aria-hidden="true" /> : null}
    </div>
  );
}
