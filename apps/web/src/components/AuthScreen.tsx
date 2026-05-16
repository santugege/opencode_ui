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
      <section className="auth-panel" aria-label="Create account">
        <div className="auth-panel__mark" aria-hidden="true">
          <Bot size={24} strokeWidth={1.8} />
        </div>
        <p className="eyebrow">Opencode</p>
        <h1>AI Workspace</h1>
        <p className="auth-panel__copy">Sign in once, then keep every opencode session isolated and ready in history.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input autoComplete="email" name="email" type="email" required />
          </label>
          <label>
            <span>Password</span>
            <input autoComplete="current-password" name="password" type="password" required />
          </label>
          {error ? <p className="auth-form__error" role="alert">{error}</p> : null}
          <button className="sidebar__new" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Creating..." : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}
