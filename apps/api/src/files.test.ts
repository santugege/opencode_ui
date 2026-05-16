import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryDatabase } from "./db";
import { createFileService, inferFileKind, sanitizeUploadName } from "./files";
import { createSessionService } from "./sessions";
import { isInsideDirectory, createWorkspaceManager } from "./workspaces";

describe("file uploads", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "opencode-ui-files-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function createSessionFixture() {
    const db = createMemoryDatabase();
    const sessions = createSessionService({
      db,
      workspaces: createWorkspaceManager({ root }),
    });
    const session = await sessions.createPendingSession({
      userId: "user_1",
      title: "Files",
    });
    return { db, session };
  }

  it("stores an upload only inside the session workspace", async () => {
    const { db, session } = await createSessionFixture();
    const files = createFileService({ db });

    const file = await files.storeUpload({
      sessionId: session.id,
      name: "brief.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from("pdf content"),
    });

    const absolutePath = resolve(session.workspacePath, file.relativePath);
    expect(isInsideDirectory(session.workspacePath, absolutePath)).toBe(true);
    expect(file.relativePath).toMatch(/^uploads\/file_[A-Za-z0-9_-]+-brief\.pdf$/);
    expect(await readFile(absolutePath, "utf8")).toBe("pdf content");
  });

  it("rejects path traversal filenames", async () => {
    const { db, session } = await createSessionFixture();
    const files = createFileService({ db });

    await expect(
      files.storeUpload({
        sessionId: session.id,
        name: "../escape.txt",
        mimeType: "text/plain",
        bytes: Buffer.from("nope"),
      }),
    ).rejects.toThrow("Invalid upload filename");
  });

  it("creates file records with kind, mime type, size, and session ownership", async () => {
    const { db, session } = await createSessionFixture();
    const files = createFileService({ db });

    const file = await files.storeUpload({
      sessionId: session.id,
      name: "image.png",
      mimeType: "image/png",
      bytes: Buffer.from([1, 2, 3]),
    });

    expect(file.sessionId).toBe(session.id);
    expect(file.kind).toBe("image");
    expect(file.mimeType).toBe("image/png");
    expect(file.size).toBe(3);
    expect(db.listSessionFiles(session.id)).toEqual([file]);
  });

  it("sanitizes simple filenames and classifies supported file kinds", () => {
    expect(sanitizeUploadName("report final.pdf")).toBe("report-final.pdf");
    expect(inferFileKind("video/mp4")).toBe("video");
    expect(inferFileKind("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("spreadsheet");
    expect(inferFileKind("application/octet-stream")).toBe("other");
  });
});
