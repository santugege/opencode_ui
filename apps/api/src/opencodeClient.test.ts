import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOpencodeSession,
  mapOpencodeError,
  opencodeForWorkspace,
  sendPrompt,
  type CreateOpencodeClient,
} from "./opencodeClient";

describe("opencode client", () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "opencode-ui-client-"));
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("creates an SDK client scoped to the session workspace directory", () => {
    const factory = vi.fn(() => ({ session: {} }));

    const client = opencodeForWorkspace({
      baseUrl: "http://127.0.0.1:4096",
      workspacePath,
      createClient: factory as CreateOpencodeClient,
    });

    expect(client).toEqual({ session: {} });
    expect(factory).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:4096",
      directory: workspacePath,
      throwOnError: true,
    });
  });

  it("creates opencode sessions with the user-owned workspace path", async () => {
    const sessionCreate = vi.fn(async () => ({ data: { id: "opencode_session_1", title: "New chat" } }));
    const factory = vi.fn(() => ({ session: { create: sessionCreate } }));

    const session = await createOpencodeSession({
      baseUrl: "http://127.0.0.1:4096",
      workspacePath,
      title: "New chat",
      createClient: factory as CreateOpencodeClient,
    });

    expect(session.id).toBe("opencode_session_1");
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ directory: workspacePath }));
    expect(sessionCreate).toHaveBeenCalledWith({ body: { title: "New chat" } });
  });

  it("sends text and workspace files as opencode prompt parts", async () => {
    const attachmentPath = join(workspacePath, "uploads", "brief.txt");
    await mkdir(join(workspacePath, "uploads"), { recursive: true });
    await writeFile(attachmentPath, "hello", "utf8");
    const sessionPrompt = vi.fn(async () => ({ data: { info: { id: "message_1" }, parts: [] } }));
    const factory = vi.fn(() => ({ session: { prompt: sessionPrompt } }));

    await sendPrompt({
      baseUrl: "http://127.0.0.1:4096",
      workspacePath,
      opencodeSessionId: "opencode_session_1",
      text: "Summarize this.",
      files: [
        {
          absolutePath: attachmentPath,
          mimeType: "text/plain",
          filename: "brief.txt",
        },
      ],
      createClient: factory as CreateOpencodeClient,
    });

    expect(sessionPrompt).toHaveBeenCalledWith({
      path: { id: "opencode_session_1" },
      body: {
        parts: [
          {
            type: "file",
            mime: "text/plain",
            filename: "brief.txt",
            url: expect.stringMatching(/^file:\/\/\/.*brief\.txt$/),
          },
          { type: "text", text: "Summarize this." },
        ],
      },
    });
  });

  it("maps opencode errors to retryable API errors", () => {
    const mapped = mapOpencodeError(Object.assign(new Error("network down"), { status: 503 }));

    expect(mapped.status).toBe(503);
    expect(mapped.retryable).toBe(true);
    expect(mapped.message).toBe("network down");
  });
});
