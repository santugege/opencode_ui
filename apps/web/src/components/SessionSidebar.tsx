import { Circle, LogOut, Plus, Search } from "lucide-react";
import type { SessionListItemView, UserView } from "../types";

const statusLabel = {
  ready: "ready",
  thinking: "thinking",
  running_tool: "running tool",
  error: "error",
} satisfies Record<SessionListItemView["status"], string>;

interface SessionSidebarProps {
  activeSessionId: string | null;
  onCreateSession?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onSignOut?: () => void;
  sessions: SessionListItemView[];
  user: UserView;
}

export function SessionSidebar({ activeSessionId, onCreateSession, onSelectSession, onSignOut, sessions, user }: SessionSidebarProps) {
  return (
    <aside className="sidebar" aria-label="Session history">
      <div className="sidebar__brand">
        <span className="brand-mark" aria-hidden="true">OC</span>
        <div>
          <p className="eyebrow">Opencode</p>
          <h1>AI Workspace</h1>
        </div>
      </div>

      <button className="sidebar__new" onClick={onCreateSession} type="button">
        <Plus size={16} strokeWidth={2} />
        New session
      </button>

      <label className="sidebar__search">
        <Search size={15} strokeWidth={1.8} aria-hidden="true" />
        <span className="sr-only">Search sessions</span>
        <input type="search" placeholder="Search sessions" />
      </label>

      <nav className="session-list" aria-label="Sessions">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;

          return (
            <button
              aria-label={`${session.title} ${statusLabel[session.status]} ${session.updatedAtLabel}`}
              aria-current={isActive ? "page" : undefined}
              className="session-list__item"
              key={session.id}
              onClick={() => onSelectSession?.(session.id)}
              type="button"
            >
              <span className={`status-dot status-dot--${session.status}`}>
                <Circle size={9} fill="currentColor" aria-hidden="true" />
              </span>
              <span className="session-list__text">
                <span className="session-list__title">{session.title}</span>
                <span className="session-list__meta">
                  {statusLabel[session.status]} · {session.updatedAtLabel}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="user-chip" title={user.email}>
          <span>{initialFor(user.email)}</span>
          <div>
            <strong>{user.email}</strong>
            <small>Personal workspace</small>
          </div>
        </div>
        <button aria-label="Sign out" className="icon-button" onClick={onSignOut} type="button">
          <LogOut size={16} strokeWidth={1.9} />
        </button>
      </div>
    </aside>
  );
}

function initialFor(email: string) {
  return email.trim().charAt(0).toUpperCase() || "U";
}
