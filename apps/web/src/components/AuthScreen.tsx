import { Bot } from "lucide-react";
import { useState, type FormEvent } from "react";

export type AuthMode = "login" | "register";

interface AuthScreenProps {
  error?: string;
  isSubmitting?: boolean;
  onModeChange?: () => void;
  onSubmit: (input: { email: string; mode: AuthMode; password: string }) => void;
}

export function AuthScreen({ error, isSubmitting = false, onModeChange, onSubmit }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("register");
  const isLogin = mode === "login";
  const submitLabel = getSubmitLabel(isLogin, isSubmitting);

  function selectMode(nextMode: AuthMode) {
    if (isSubmitting || nextMode === mode) return;
    setMode(nextMode);
    onModeChange?.();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      email: String(data.get("email") ?? ""),
      mode,
      password: String(data.get("password") ?? ""),
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label={isLogin ? "登录" : "创建账号"}>
        <div className="auth-panel__mark" aria-hidden="true">
          <Bot size={24} strokeWidth={1.8} />
        </div>
        <p className="eyebrow">Opencode</p>
        <h1>AI 工作区</h1>
        <p className="auth-panel__copy">登录一次，即可在历史记录中保留每个独立的 opencode 会话。</p>

        <div className="auth-tabs" role="tablist" aria-label="认证方式">
          <button
            aria-selected={isLogin}
            className="auth-tabs__button"
            disabled={isSubmitting}
            onClick={() => selectMode("login")}
            role="tab"
            type="button"
          >
            登录
          </button>
          <button
            aria-selected={!isLogin}
            className="auth-tabs__button"
            disabled={isSubmitting}
            onClick={() => selectMode("register")}
            role="tab"
            type="button"
          >
            创建账号
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>邮箱</span>
            <input autoComplete="email" name="email" type="email" required />
          </label>
          <label>
            <span>密码</span>
            <input
              autoComplete={isLogin ? "current-password" : "new-password"}
              name="password"
              required
              type="password"
            />
          </label>
          {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
          <button className="sidebar__new" disabled={isSubmitting} type="submit">
            {submitLabel}
          </button>
        </form>
      </section>
    </main>
  );
}

function getSubmitLabel(isLogin: boolean, isSubmitting: boolean) {
  if (!isSubmitting) return isLogin ? "登录" : "创建账号";
  return isLogin ? "登录中..." : "创建中...";
}
