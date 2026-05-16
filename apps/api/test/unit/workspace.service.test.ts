import { mkdtemp, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryDatabase } from "../../src/repositories/memory.repository";
import { createSessionService } from "../../src/services/session.service";
import { createWorkspaceManager, isInsideDirectory } from "../../src/services/workspace.service";

describe("session workspace lifecycle", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "opencode-ui-workspaces-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates a unique workspace directory under the configured storage root", async () => {
    const workspaces = createWorkspaceManager({ root });

    const workspace = await workspaces.createSessionWorkspace({
      userId: "user_1",
      sessionId: "session_1",
    });

    expect(isInsideDirectory(root, workspace.absolutePath)).toBe(true);
    expect(workspace.relativePath).toBe("user_1/session_1");
    await expect(stat(workspace.absolutePath)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("keeps sessions isolated across users and session ids", async () => {
    const workspaces = createWorkspaceManager({ root });

    const first = await workspaces.createSessionWorkspace({ userId: "user_1", sessionId: "session_1" });
    const second = await workspaces.createSessionWorkspace({ userId: "user_1", sessionId: "session_2" });
    const third = await workspaces.createSessionWorkspace({ userId: "user_2", sessionId: "session_1" });

    expect(new Set([first.absolutePath, second.absolutePath, third.absolutePath]).size).toBe(3);
    for (const workspace of [first, second, third]) {
      expect(isInsideDirectory(root, workspace.absolutePath)).toBe(true);
    }
  });

  it("rejects traversal-shaped identifiers before creating directories", async () => {
    const workspaces = createWorkspaceManager({ root });

    await expect(
      workspaces.createSessionWorkspace({
        userId: "../user",
        sessionId: "session_1",
      }),
    ).rejects.toThrow("Invalid workspace identifier");
  });

  it("creates an app session with server-owned workspace fields and no opencode binding", async () => {
    const db = createMemoryDatabase();
    const sessions = createSessionService({
      db,
      workspaces: createWorkspaceManager({ root }),
    });

    const session = await sessions.createPendingSession({
      userId: "user_1",
      title: "Untitled",
    });

    expect(session.userId).toBe("user_1");
    expect(session.title).toBe("Untitled");
    expect(session.status).toBe("ready");
    expect(session.opencodeSessionId).toBeNull();
    expect(resolve(session.workspacePath)).toContain(resolve(root));
    expect(db.findWorkspaceSessionById(session.id)?.workspacePath).toBe(session.workspacePath);
  });
});
