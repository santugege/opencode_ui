import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryDatabase } from "../../src/repositories/memory.repository";
import { createFileService, inferFileKind, sanitizeUploadName } from "../../src/services/file.service";
import { isInsideDirectory, createWorkspaceManager } from "../../src/services/workspace.service";

describe("file uploads", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "opencode-ui-files-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function createWorkspaceFixture() {
    const db = createMemoryDatabase();
    const workspace = await createWorkspaceManager({ root }).createUserWorkspace({
      userId: "user_1",
    });
    return { db, sessionId: "opencode_session_1", workspacePath: workspace.absolutePath };
  }

  it("stores an upload only inside the user workspace", async () => {
    const { db, sessionId, workspacePath } = await createWorkspaceFixture();
    const files = createFileService({ db });

    const file = await files.storeUpload({
      sessionId,
      workspacePath,
      name: "brief.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("pdf content"),
    });

    const absolutePath = resolve(workspacePath, file.relativePath);
    expect(isInsideDirectory(workspacePath, absolutePath)).toBe(true);
    expect(file.relativePath).toMatch(/^uploads\/file_[A-Za-z0-9_-]+-brief\.pdf$/);
    expect(await readFile(absolutePath, "utf8")).toBe("pdf content");
  });

  it("rejects path traversal filenames", async () => {
    const { db, sessionId, workspacePath } = await createWorkspaceFixture();
    const files = createFileService({ db });

    await expect(
      files.storeUpload({
        sessionId,
        workspacePath,
        name: "../escape.txt",
        mimeType: "text/plain",
        bytes: Buffer.from("nope"),
      }),
    ).rejects.toThrow("Invalid upload filename");
  });

  it("creates file records with kind, mime type, size, and session ownership", async () => {
    const { db, sessionId, workspacePath } = await createWorkspaceFixture();
    const files = createFileService({ db });

    const file = await files.storeUpload({
      sessionId,
      workspacePath,
      name: "image.png",
      mimeType: "image/png",
      bytes: Buffer.from([1, 2, 3]),
    });

    expect(file.sessionId).toBe(sessionId);
    expect(file.kind).toBe("image");
    expect(file.mimeType).toBe("image/png");
    expect(file.size).toBe(3);
    expect(db.listSessionFiles(sessionId)).toEqual([file]);
  });

  it("sanitizes simple filenames and classifies supported file kinds", () => {
    expect(sanitizeUploadName("report final.pdf")).toBe("report-final.pdf");
    expect(inferFileKind("video/mp4")).toBe("video");
    expect(inferFileKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("spreadsheet");
    expect(inferFileKind("application/octet-stream")).toBe("other");
  });
});
