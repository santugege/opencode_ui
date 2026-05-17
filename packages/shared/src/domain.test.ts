import { describe, expect, it } from "vitest";
import type {
  ChatMessage,
  FileKind,
  MessageRole,
  SessionFile,
  SessionStatus,
  User,
  WorkspaceSession,
} from "./domain";

describe("domain types", () => {
  it("models a registered user", () => {
    const user: User = {
      id: "user_1",
      email: "person@example.com",
      workspacePath: "storage/workspaces/user_1",
      createdAt: "2026-05-15T00:00:00.000Z",
    };

    expect(user.email).toBe("person@example.com");
    expect(user.workspacePath).toContain("storage/workspaces/user_1");
  });

  it("models an opencode-backed workspace session", () => {
    const status: SessionStatus = "ready";
    const session: WorkspaceSession = {
      id: "opencode_session_1",
      userId: "user_1",
      title: "Research notes",
      status,
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:01:00.000Z",
    };

    expect(session.id).toBe("opencode_session_1");
  });

  it("models chat messages with inline session files", () => {
    const kind: FileKind = "document";
    const role: MessageRole = "user";
    const file: SessionFile = {
      id: "file_1",
      sessionId: "session_1",
      name: "brief.pdf",
      kind,
      mimeType: "application/pdf",
      size: 2048,
      relativePath: "uploads/file_1-brief.pdf",
      createdAt: "2026-05-15T00:02:00.000Z",
    };
    const message: ChatMessage = {
      id: "message_1",
      sessionId: "session_1",
      role,
      content: "Summarize this.",
      files: [file],
      createdAt: "2026-05-15T00:03:00.000Z",
    };

    expect(message.files).toHaveLength(1);
    expect(message.files[0]?.relativePath).toBe("uploads/file_1-brief.pdf");
  });
});
