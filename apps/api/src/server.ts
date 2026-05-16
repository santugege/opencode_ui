import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { ChatMessage, SessionFile, User, WorkspaceSession } from "@opencode-ui/shared";
import { AuthError, clearSessionCookie, createAuthService, parseSessionCookie } from "./auth";
import { createMemoryDatabase, type MemoryDatabase } from "./db";
import { createFileService } from "./files";
import {
  createOpencodeSession as defaultCreateOpencodeSession,
  sendPrompt as defaultSendPrompt,
  type createOpencodeSession,
  type sendPrompt,
} from "./opencodeClient";
import { createSessionService } from "./sessions";
import { createWorkspaceManager } from "./workspaces";

const DEFAULT_SESSION_TITLES = new Set(["Untitled session", "未命名会话"]);
const DEFAULT_SESSION_TITLE = "未命名会话";

type CreateOpencodeSessionFn = typeof createOpencodeSession;
type SendPromptFn = typeof sendPrompt;

export interface ApiServerOptions {
  createOpencodeSession?: CreateOpencodeSessionFn;
  corsOrigins?: string[];
  db?: MemoryDatabase;
  opencodeBaseUrl?: string;
  opencodeMode?: "live" | "stub";
  sendPrompt?: SendPromptFn;
  storageRoot?: string;
}

export interface JsonFetchOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
}

interface CurrentUser {
  sessionId: string;
  user: User;
}

interface JsonResponse {
  body: unknown;
  headers: Headers;
  status: number;
}

export function createApiServer(options: ApiServerOptions = {}) {
  const db = options.db ?? createMemoryDatabase();
  const storageRoot = options.storageRoot ?? resolve(process.cwd(), "storage", "workspaces");
  const opencodeBaseUrl = options.opencodeBaseUrl ?? process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096";
  const opencodeMode = options.opencodeMode ?? (process.env.OPENCODE_UI_TEST_MODE === "1" ? "stub" : "live");
  const corsOrigins = new Set(options.corsOrigins ?? configuredCorsOrigins());
  const auth = createAuthService(db);
  const workspaces = createWorkspaceManager({ root: storageRoot });
  const sessions = createSessionService({ db, workspaces });
  const files = createFileService({ db });
  const createOpencode = options.createOpencodeSession ?? (opencodeMode === "stub" ? stubCreateOpencodeSession : defaultCreateOpencodeSession);
  const promptOpencode = options.sendPrompt ?? (opencodeMode === "stub" ? stubSendPrompt : defaultSendPrompt);

  async function route(input: {
    body?: unknown;
    headers: Headers;
    method: string;
    path: string;
  }): Promise<JsonResponse> {
    const cors = corsHeaders(input.headers, corsOrigins);
    if (input.method === "OPTIONS") {
      return json(204, null, cors);
    }

    return withResponseHeaders(await routeJson(input), cors);
  }

  async function routeJson(input: {
    body?: unknown;
    headers: Headers;
    method: string;
    path: string;
  }): Promise<JsonResponse> {
    try {
      if (input.method === "GET" && input.path === "/health") {
        return json(200, { healthy: true });
      }

      if (input.method === "POST" && input.path === "/auth/register") {
        const body = input.body as { email?: string; password?: string };
        if (!body.email || !body.password) return json(400, { error: "Email and password are required." });

        await auth.register(body.email, body.password);
        const login = await auth.login(body.email, body.password);
        return json(201, { user: login.user }, { "set-cookie": login.cookie });
      }

      if (input.method === "POST" && input.path === "/auth/login") {
        const body = input.body as { email?: string; password?: string };
        if (!body.email || !body.password) return json(400, { error: "Email and password are required." });

        const login = await auth.login(body.email, body.password);
        return json(200, { user: login.user }, { "set-cookie": login.cookie });
      }

      if (input.method === "POST" && input.path === "/auth/logout") {
        return json(200, { ok: true }, { "set-cookie": clearSessionCookie() });
      }

      if (input.method === "GET" && input.path === "/auth/me") {
        const current = currentUser(input.headers, db);
        if (!current) return json(401, { error: "Authentication required." });
        return json(200, { user: current.user });
      }

      if (input.path === "/sessions" && input.method === "GET") {
        const current = currentUser(input.headers, db);
        if (!current) return json(401, { error: "Authentication required." });
        return json(200, {
          sessions: db.listWorkspaceSessionsByUserId(current.user.id).map((session) =>
            serializeSession(session, db),
          ),
        });
      }

      if (input.path === "/sessions" && input.method === "POST") {
        const current = currentUser(input.headers, db);
        if (!current) return json(401, { error: "Authentication required." });

        const body = input.body as { title?: string };
        const title = body.title?.trim() || DEFAULT_SESSION_TITLE;
        const session = await sessions.createPendingSession({ title, userId: current.user.id });
        const opencodeSession = await createOpencode({
          baseUrl: opencodeBaseUrl,
          title,
          workspacePath: session.workspacePath,
        });
        const bound = sessions.bindOpencodeSession({
          opencodeSessionId: opencodeSession.id,
          sessionId: session.id,
        });
        return json(201, { session: serializeSession(bound, db) });
      }

      const fileMatch = input.path.match(/^\/sessions\/([^/]+)\/files$/);
      if (fileMatch && input.method === "POST") {
        const current = currentUser(input.headers, db);
        if (!current) return json(401, { error: "Authentication required." });
        const session = ownedSession(db, current.user.id, fileMatch[1]);
        if (!session) return json(404, { error: "Session not found." });

        const body = input.body as { contentBase64?: string; mimeType?: string; name?: string };
        if (!body.contentBase64 || !body.mimeType || !body.name) {
          return json(400, { error: "File name, MIME type, and content are required." });
        }
        const file = await files.storeUpload({
          bytes: Buffer.from(body.contentBase64, "base64"),
          mimeType: body.mimeType,
          name: body.name,
          sessionId: session.id,
        });
        return json(201, { file: serializeFile(file) });
      }

      const messageMatch = input.path.match(/^\/sessions\/([^/]+)\/messages$/);
      if (messageMatch && input.method === "POST") {
        const current = currentUser(input.headers, db);
        if (!current) return json(401, { error: "Authentication required." });
        const session = ownedSession(db, current.user.id, messageMatch[1]);
        if (!session) return json(404, { error: "Session not found." });
        if (!session.opencodeSessionId) return json(409, { error: "Session is not bound to opencode." });

        const body = input.body as { fileIds?: string[]; text?: string };
        const text = body.text?.trim();
        if (!text) return json(400, { error: "Message text is required." });

        const allFiles = db.listSessionFiles(session.id);
        const attachedFiles = allFiles.filter((file) => body.fileIds?.includes(file.id));
        await promptOpencode({
          baseUrl: opencodeBaseUrl,
          files: attachedFiles.map((file) => ({
            absolutePath: resolve(session.workspacePath, file.relativePath),
            filename: file.name,
            mimeType: file.mimeType,
          })),
          opencodeSessionId: session.opencodeSessionId,
          text,
          workspacePath: session.workspacePath,
        });

        const message = db.createChatMessage({
          content: text,
          createdAt: new Date().toISOString(),
          files: attachedFiles,
          id: randomUUID(),
          role: "user",
          sessionId: session.id,
        });
        const updated = db.updateWorkspaceSession({
          ...session,
          status: "ready",
          title: isDefaultSessionTitle(session.title) ? titleFromMessage(text) : session.title,
          updatedAt: message.createdAt,
        });
        return json(201, { message: serializeMessage(message), session: serializeSession(updated, db) });
      }

      return json(404, { error: "Not found" });
    } catch (error) {
      if (error instanceof AuthError) {
        return json(error.code === "EMAIL_ALREADY_REGISTERED" ? 409 : 401, { error: error.message });
      }
      const message = error instanceof Error ? error.message : "Unexpected API error.";
      return json(500, { error: message });
    }
  }

  const httpServer = createServer(async (request, response) => {
    const requestBody = await readRequestJson(request);
    const result = await route({
      body: requestBody,
      headers: headersFromIncoming(request),
      method: request.method ?? "GET",
      path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
    });
    writeJson(response, result);
  });

  return Object.assign(httpServer, {
    async fetchJson(path: string, input: JsonFetchOptions = {}) {
      return route({
        body: input.body,
        headers: new Headers(input.headers),
        method: input.method ?? "GET",
        path,
      });
    },
  });
}

function currentUser(headers: Headers, db: MemoryDatabase): CurrentUser | undefined {
  const sessionId = parseSessionCookie(headers.get("cookie") ?? "");
  if (!sessionId) return undefined;
  const session = db.findUserSessionById(sessionId);
  if (!session) return undefined;
  const user = db.findUserById(session.userId);
  if (!user) return undefined;
  return { sessionId, user };
}

function ownedSession(db: MemoryDatabase, userId: string, sessionId: string | undefined) {
  if (!sessionId) return undefined;
  const session = db.findWorkspaceSessionById(sessionId);
  return session?.userId === userId ? session : undefined;
}

function serializeFile(file: SessionFile) {
  return file;
}

function serializeMessage(message: ChatMessage) {
  return {
    ...message,
    files: message.files.map(serializeFile),
  };
}

function serializeSession(session: WorkspaceSession, db: MemoryDatabase) {
  return {
    ...session,
    files: db.listSessionFiles(session.id).map(serializeFile),
    messages: db.listChatMessages(session.id).map(serializeMessage),
  };
}

function titleFromMessage(text: string) {
  return text.split(/\s+/).slice(0, 5).join(" ").slice(0, 60) || DEFAULT_SESSION_TITLE;
}

function isDefaultSessionTitle(title: string) {
  return DEFAULT_SESSION_TITLES.has(title.trim());
}

function configuredCorsOrigins() {
  return (process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(requestHeaders: Headers, allowedOrigins: Set<string>): Record<string, string> {
  const origin = requestHeaders.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    return {};
  }

  return {
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": requestHeaders.get("access-control-request-headers") ?? "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": origin,
    vary: "Origin",
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): JsonResponse {
  return {
    body,
    headers: new Headers({
      "content-type": "application/json",
      ...headers,
    }),
    status,
  };
}

function withResponseHeaders(result: JsonResponse, extraHeaders: Record<string, string>): JsonResponse {
  const headers = new Headers(result.headers);
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (key.toLowerCase() === "vary" && headers.has("vary")) {
      headers.set(key, `${headers.get("vary")}, ${value}`);
    } else {
      headers.set(key, value);
    }
  }
  return { ...result, headers };
}

async function readRequestJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function headersFromIncoming(request: IncomingMessage) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (value) {
      headers.set(key, value);
    }
  }
  return headers;
}

function writeJson(response: ServerResponse, result: JsonResponse) {
  response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
  if (result.status === 204) {
    response.end();
    return;
  }
  response.end(JSON.stringify(result.body));
}

const stubCreateOpencodeSession: CreateOpencodeSessionFn = async (input) => ({
  id: `stub-opencode-${randomUUID()}`,
  title: input.title,
});

const stubSendPrompt: SendPromptFn = async () => ({ ok: true });
