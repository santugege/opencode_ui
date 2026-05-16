import { Bot } from "lucide-react";
import type { FormEvent } from "react";

interface AuthScreenProps {
  error?: string;
  isSubmitting?: boolean;
  onSubmit: (input: { email: string; password: string }) => void;
}

export function AuthScreen({ error, isSubmitting = false, onSubmit }: AuthScreenProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="创建账号">
        <div className="auth-panel__mark" aria-hidden="true">
          <Bot size={24} strokeWidth={1.8} />
        </div>
        <p className="eyebrow">Opencode</p>
        <h1>AI 工作区</h1>
        <p className="auth-panel__copy">登录一次，即可在历史记录中保留每个独立的 opencode 会话。</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>邮箱</span>
            <input autoComplete="email" name="email" type="email" required />
          </label>
          <label>
            <span>密码</span>
            <input autoComplete="current-password" name="password" type="password" required />
          </label>
          {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
          <button className="sidebar__new" disabled={isSubmitting} type="submit">
            {isSubmitting ? "创建中..." : "创建账号"}
          </button>
        </form>
      </section>
    </main>
  );
}
