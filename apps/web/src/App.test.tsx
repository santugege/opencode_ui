import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App, { WorkspaceApp } from "./App";
import type { ApiClient, ApiSession } from "./api";
import type { WorkspaceViewModel } from "./types";

const viewModel: WorkspaceViewModel = {
  user: {
    email: "person@example.com",
  },
  sessions: [
    {
      id: "session-1",
      title: "Image extraction",
      status: "thinking",
      updatedAtLabel: "2m ago",
    },
    {
      id: "session-2",
      title: "Quarterly brief",
      status: "ready",
      updatedAtLabel: "Yesterday",
    },
  ],
  activeSessionId: "session-1",
  messages: [
    {
      id: "message-1",
      role: "user",
      content: "Pull the action items from this deck.",
      createdAtLabel: "10:30",
      files: [
        {
          id: "file-1",
          name: "launch-plan.pdf",
          kind: "document",
          sizeLabel: "1.8 MB",
          status: "ready",
        },
      ],
    },
    {
      id: "message-2",
      role: "assistant",
      content: "I found three launch risks and a missing owner for QA signoff.",
      createdAtLabel: "10:31",
      files: [],
    },
  ],
  composerFiles: [
    {
      id: "file-2",
      name: "interview-notes.docx",
      kind: "document",
      sizeLabel: "84 KB",
      status: "uploading",
      progress: 62,
    },
    {
      id: "file-3",
      name: "screenshot.png",
      kind: "image",
      sizeLabel: "422 KB",
      status: "ready",
    },
  ],
  error: "Opencode paused while the session reconnects.",
};

describe("WorkspaceApp", () => {
  it("renders the default workspace shell", () => {
    render(<WorkspaceApp />);

    expect(screen.getByRole("button", { name: "New session" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Document review" })).toBeInTheDocument();
    expect(screen.getByText("Compare these notes and tell me what needs follow-up before the review.")).toBeInTheDocument();
    expect(screen.getByText("interview-notes.docx")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Message opencode...")).toBeInTheDocument();
  });

  it("renders the empty session state", () => {
    render(
      <WorkspaceApp
        model={{
          user: { email: "person@example.com" },
          sessions: [
            {
              id: "session-empty",
              title: "Untitled session",
              status: "ready",
              updatedAtLabel: "Now",
            },
          ],
          activeSessionId: "session-empty",
          messages: [],
          composerFiles: [],
        }}
      />,
    );

    expect(screen.getAllByText("Untitled session")).toHaveLength(3);
    expect(screen.getByText("Ask anything, attach files, and opencode will work inside this isolated session.")).toBeInTheDocument();
  });

  it("renders session history, status, chat messages, and inline files", () => {
    render(<WorkspaceApp model={viewModel} />);

    expect(screen.getByRole("complementary", { name: "Session history" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Image extraction thinking 2m ago" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Quarterly brief")).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();

    expect(screen.getByText("Pull the action items from this deck.")).toBeInTheDocument();
    expect(screen.getByText("I found three launch risks and a missing owner for QA signoff.")).toBeInTheDocument();
    expect(screen.getByText("launch-plan.pdf")).toBeInTheDocument();
    expect(screen.getByText("1.8 MB")).toBeInTheDocument();
  });

  it("renders composer attachments, upload progress, and retryable errors", () => {
    const onRetry = vi.fn();
    render(<WorkspaceApp model={viewModel} onRetry={onRetry} />);

    expect(screen.getByLabelText("Attach files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(screen.getByText("interview-notes.docx")).toBeInTheDocument();
    expect(screen.getByText("Uploading 62%")).toBeInTheDocument();
    expect(screen.getByText("screenshot.png")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "screenshot.png Ready" })).toBeInTheDocument();
    expect(screen.getByText("Opencode paused while the session reconnects.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry opencode request" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("App integration shell", () => {
  it("registers a new user and enters an empty workspace", async () => {
    const api = createFakeApi();
    render(<App api={api} />);

    expect(await screen.findByRole("heading", { name: "AI Workspace" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await screen.findByRole("button", { name: "New session" });

    expect(screen.getByText("person@example.com")).toBeInTheDocument();
    expect(screen.getByText("Ask anything, attach files, and opencode will work inside this isolated session.")).toBeInTheDocument();
  });

  it("creates a session, uploads a file, sends a message, and revisits session history", async () => {
    const api = createFakeApi();
    render(<App api={api} />);

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("button", { name: "New session" });

    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    expect(await screen.findByRole("button", { name: "Untitled session ready Now" })).toHaveAttribute("aria-current", "page");

    const file = new File(["Quarterly numbers"], "quarterly.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Attach files"), {
      target: { files: [file] },
    });

    await screen.findByText("quarterly.csv");

    fireEvent.change(screen.getByPlaceholderText("Message opencode..."), {
      target: { value: "Summarize this spreadsheet." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(within(screen.getByRole("list")).getByText("Summarize this spreadsheet.")).toBeInTheDocument();
    });
    expect(screen.getByRole("article", { name: "quarterly.csv Ready" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Summarize this spreadsheet. ready Now" }));

    await waitFor(() => {
      expect(within(screen.getByRole("list")).getByText("Summarize this spreadsheet.")).toBeInTheDocument();
    });
  });

  it("signs out and returns to the auth screen", async () => {
    const api = createFakeApi();
    render(<App api={api} />);

    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("button", { name: "New session" });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.queryByText("person@example.com")).not.toBeInTheDocument();
    expect(api.logout).toHaveBeenCalledOnce();
  });
});

function createFakeApi(): ApiClient {
  let user: { email: string } | null = null;
  let sessions: ApiSession[] = [];
  let sequence = 0;
  const logout = vi.fn(async () => {
    user = null;
    sessions = [];
  });

  return {
    async createSession(input) {
      sequence += 1;
      const session: ApiSession = {
        id: `session-${sequence}`,
        title: input.title,
        status: "ready",
        updatedAt: new Date().toISOString(),
        files: [],
        messages: [],
      };
      sessions = [session, ...sessions];
      return session;
    },

    async listSessions() {
      return sessions;
    },

    async login(input) {
      user = { email: input.email };
      return { user };
    },

    logout,

    async me() {
      return user ? { user } : null;
    },

    async register(input) {
      user = { email: input.email };
      return { user };
    },

    async sendMessage(sessionId, input) {
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (!session) throw new Error("Session not found");
      const files = session.files.filter((file) => input.fileIds.includes(file.id));
      const message = {
        id: `message-${sequence}`,
        role: "user" as const,
        content: input.text,
        createdAt: new Date().toISOString(),
        files,
        sessionId,
      };
      session.messages = [...session.messages, message];
      session.title = input.text;
      return { message, session };
    },

    async uploadFile(sessionId, file) {
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (!session) throw new Error("Session not found");
      const uploaded = {
        id: `file-${sequence}`,
        name: file.name,
        kind: "spreadsheet" as const,
        mimeType: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      };
      session.files = [...session.files, uploaded];
      return uploaded;
    },
  };
}
