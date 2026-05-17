import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpencodeService, mapOpencodeError } from "../../src/services/opencode.service";
import type { CreateOpencodeClient } from "../../src/types/opencode";

describe("opencode client", () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "opencode-ui-client-"));
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("creates one SDK client without binding it to a workspace directory", () => {
    const factory = vi.fn(() => ({ session: {} }));

    const service = createOpencodeService({
      baseUrl: "http://127.0.0.1:4096",
      createClient: factory as CreateOpencodeClient,
    });

    expect(service).toHaveProperty("createSession");
    expect(service).toHaveProperty("sendPrompt");
    expect(factory).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:4096",
      throwOnError: true,
    });
  });

  it("creates opencode sessions with the user-owned workspace directory query", async () => {
    const sessionCreate = vi.fn(async () => ({
      data: {
        id: "opencode_session_1",
        title: "New chat",
        time: { created: Date.now(), updated: Date.now() },
      },
    }));
    const factory = vi.fn(() => ({ session: { create: sessionCreate } }));
    const service = createOpencodeService({
      baseUrl: "http://127.0.0.1:4096",
      createClient: factory as CreateOpencodeClient,
    });

    const session = await service.createSession({
      workspacePath,
      title: "New chat",
    });

    expect(session.id).toBe("opencode_session_1");
    expect(factory).toHaveBeenCalledTimes(1);
    expect(sessionCreate).toHaveBeenCalledWith({
      body: { title: "New chat" },
      query: { directory: workspacePath },
    });
  });

  it("sends text and workspace files with the user-owned workspace directory query", async () => {
    const attachmentPath = join(workspacePath, "uploads", "brief.txt");
    await mkdir(join(workspacePath, "uploads"), { recursive: true });
    await writeFile(attachmentPath, "hello", "utf8");
    const sessionPrompt = vi.fn(async () => ({
      data: {
        info: { id: "message_1", role: "user" as const, time: { created: Date.now() } },
        parts: [],
      },
    }));
    const factory = vi.fn(() => ({ session: { prompt: sessionPrompt } }));
    const service = createOpencodeService({
      baseUrl: "http://127.0.0.1:4096",
      createClient: factory as CreateOpencodeClient,
    });

    await service.sendPrompt({
      workspacePath,
      sessionId: "opencode_session_1",
      text: "Summarize this.",
      files: [
        {
          absolutePath: attachmentPath,
          mimeType: "text/plain",
          filename: "brief.txt",
        },
      ],
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(sessionPrompt).toHaveBeenCalledWith({
      path: { id: "opencode_session_1" },
      query: { directory: workspacePath },
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
