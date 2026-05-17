import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkspaceManager, isInsideDirectory } from "../../src/services/workspace.service";

describe("user workspace lifecycle", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "opencode-ui-workspaces-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates a user workspace directory under the configured storage root", async () => {
    const workspaces = createWorkspaceManager({ root });

    const workspace = await workspaces.createUserWorkspace({
      userId: "user_1",
    });

    expect(isInsideDirectory(root, workspace.absolutePath)).toBe(true);
    expect(workspace.relativePath).toBe("user_1");
    await expect(stat(workspace.absolutePath)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("keeps workspaces isolated across users", async () => {
    const workspaces = createWorkspaceManager({ root });

    const first = await workspaces.createUserWorkspace({ userId: "user_1" });
    const second = await workspaces.createUserWorkspace({ userId: "user_2" });

    expect(new Set([first.absolutePath, second.absolutePath]).size).toBe(2);
    for (const workspace of [first, second]) {
      expect(isInsideDirectory(root, workspace.absolutePath)).toBe(true);
    }
  });

  it("rejects traversal-shaped identifiers before creating directories", async () => {
    const workspaces = createWorkspaceManager({ root });

    await expect(
      workspaces.createUserWorkspace({
        userId: "../user",
      }),
    ).rejects.toThrow("Invalid workspace identifier");
  });
});
