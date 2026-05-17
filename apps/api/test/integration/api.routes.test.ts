import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiServer, type ApiServerOptions } from "../../src/app/createApp";

let storageRoot: string;

type AnyJson = Record<string, any>;

beforeEach(async () => {
  storageRoot = await mkdtemp(join(tmpdir(), "opencode-ui-api-"));
});

afterEach(async () => {
  await rm(storageRoot, { force: true, recursive: true });
});

describe("api server routes", () => {
  it("registers a user and returns the current user with a session cookie", async () => {
    const server = createApiServer({ storageRoot });

    const register = await server.fetchJson("/auth/register", {
      body: { email: "Person@Example.com", password: "secret123" },
      method: "POST",
    });

    expect(register.status).toBe(201);
    expect(register.headers.get("set-cookie")).toContain("opencode_ui_session=");
    expect((register.body as AnyJson).user.email).toBe("person@example.com");

    const me = await server.fetchJson("/auth/me", {
      headers: { cookie: register.headers.get("set-cookie") ?? "" },
    });

    expect(me.status).toBe(200);
    expect((me.body as AnyJson).user.email).toBe("person@example.com");
  });

  it("logs out a user by clearing the session cookie", async () => {
    const server = createApiServer({ storageRoot });

    const register = await server.fetchJson("/auth/register", {
      body: { email: "person@example.com", password: "secret123" },
      method: "POST",
    });
    const cookie = register.headers.get("set-cookie") ?? "";

    const logout = await server.fetchJson("/auth/logout", {
      headers: { cookie },
      method: "POST",
    });

    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("opencode_ui_session=;");
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const me = await server.fetchJson("/auth/me", {
      headers: { cookie: logout.headers.get("set-cookie") ?? "" },
    });

    expect(me.status).toBe(401);
  });

  it("requires authentication for session routes", async () => {
    const server = createApiServer({ storageRoot });

    const response = await server.fetchJson("/sessions", { method: "GET" });

    expect(response.status).toBe(401);
    expect((response.body as AnyJson).error).toBe("Authentication required.");
  });

  it("answers browser preflight requests with credentialed CORS headers", async () => {
    const server = createApiServer({ storageRoot });

    const response = await server.fetchJson("/sessions", {
      headers: {
        "access-control-request-headers": "content-type",
        "access-control-request-method": "POST",
        origin: "http://127.0.0.1:5173",
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("creates sessions, uploads files, sends messages, and revisits history", async () => {
    const now = Date.now();
    const createOpencodeSession = vi.fn<NonNullable<ApiServerOptions["createOpencodeSession"]>>(async () => ({
      id: "opencode_session_1",
      title: "Research session",
      time: { created: now, updated: now },
    }));
    const sendPrompt = vi.fn<NonNullable<ApiServerOptions["sendPrompt"]>>(async (input) => ({
      info: {
        id: "message_1",
        role: "user",
        time: { created: now + 1 },
      },
      parts: [
        ...input.files.map((file) => ({
          type: "file" as const,
          mime: file.mimeType,
          filename: file.filename,
          url: pathToFileURL(file.absolutePath).href,
        })),
        { type: "text" as const, text: input.text },
      ],
    }));
    const server = createApiServer({
      createOpencodeSession,
      sendPrompt,
      storageRoot,
    });

    const register = await server.fetchJson("/auth/register", {
      body: { email: "person@example.com", password: "secret123" },
      method: "POST",
    });
    const cookie = register.headers.get("set-cookie") ?? "";

    const created = await server.fetchJson("/sessions", {
      body: { title: "Research session" },
      headers: { cookie },
      method: "POST",
    });

    expect(created.status).toBe(201);
    const createdBody = created.body as AnyJson;
    expect(createdBody.session.title).toBe("Research session");
    expect(createdBody.session.id).toBe("opencode_session_1");

    const upload = await server.fetchJson(`/sessions/${createdBody.session.id}/files`, {
      body: {
        contentBase64: Buffer.from("hello world").toString("base64"),
        mimeType: "text/plain",
        name: "notes.txt",
      },
      headers: { cookie },
      method: "POST",
    });

    expect(upload.status).toBe(201);
    const uploadBody = upload.body as AnyJson;
    expect(uploadBody.file.name).toBe("notes.txt");

    const message = await server.fetchJson(`/sessions/${createdBody.session.id}/messages`, {
      body: {
        fileIds: [uploadBody.file.id],
        text: "Summarize this file.",
      },
      headers: { cookie },
      method: "POST",
    });

    expect(message.status).toBe(201);
    const messageBody = message.body as AnyJson;
    expect(messageBody.message.content).toBe("Summarize this file.");
    expect(messageBody.message.files).toHaveLength(1);
    expect(sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "opencode_session_1",
        text: "Summarize this file.",
      }),
    );

    const history = await server.fetchJson("/sessions", {
      headers: { cookie },
      method: "GET",
    });

    expect(history.status).toBe(200);
    const historyBody = history.body as AnyJson;
    expect(historyBody.sessions).toHaveLength(1);
    expect(historyBody.sessions[0].messages).toBeUndefined();

    const detail = await server.fetchJson(`/sessions/${createdBody.session.id}`, {
      headers: { cookie },
      method: "GET",
    });

    expect(detail.status).toBe(200);
    const detailBody = detail.body as AnyJson;
    expect(detailBody.session.messages[0].content).toBe("Summarize this file.");
  });

  it("uses test-mode opencode stubs when requested for browser e2e runs", async () => {
    const server = createApiServer({
      opencodeMode: "stub",
      storageRoot,
    });

    const register = await server.fetchJson("/auth/register", {
      body: { email: "person@example.com", password: "secret123" },
      method: "POST",
    });
    const cookie = register.headers.get("set-cookie") ?? "";

    const created = await server.fetchJson("/sessions", {
      body: { title: "Untitled session" },
      headers: { cookie },
      method: "POST",
    });

    expect(created.status).toBe(201);
    const createdBody = created.body as AnyJson;
    expect(createdBody.session.id).toMatch(/^stub-opencode-/);

    const message = await server.fetchJson(`/sessions/${createdBody.session.id}/messages`, {
      body: {
        fileIds: [],
        text: "Hello test mode.",
      },
      headers: { cookie },
      method: "POST",
    });

    expect(message.status).toBe(201);
    expect((message.body as AnyJson).message.content).toBe("Hello test mode.");
  });

  it("promotes Chinese default session titles to the first message title", async () => {
    const server = createApiServer({
      opencodeMode: "stub",
      storageRoot,
    });

    const register = await server.fetchJson("/auth/register", {
      body: { email: "person@example.com", password: "secret123" },
      method: "POST",
    });
    const cookie = register.headers.get("set-cookie") ?? "";

    const created = await server.fetchJson("/sessions", {
      body: { title: "未命名会话" },
      headers: { cookie },
      method: "POST",
    });

    expect(created.status).toBe(201);
    const createdBody = created.body as AnyJson;

    const message = await server.fetchJson(`/sessions/${createdBody.session.id}/messages`, {
      body: {
        fileIds: [],
        text: "Summarize this spreadsheet.",
      },
      headers: { cookie },
      method: "POST",
    });

    expect(message.status).toBe(201);
    expect((message.body as AnyJson).session.title).toBe("Summarize this spreadsheet.");
  });
});
