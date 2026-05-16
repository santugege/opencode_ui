# Opencode AI Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a registration-based AI workspace website that uses opencode as its only AI/agent backend, with isolated per-session workspaces, chat, inline file attachments, and session history.

**Architecture:** Create a full-stack web app with a frontend chat workspace and a backend orchestration API. The backend owns auth, database records, uploads, workspace directories, and calls into `opencode serve`; opencode owns AI execution and session-level isolation. Use one shared opencode server process and call it through `@opencode-ai/sdk` with a per-request `directory` bound to the app session workspace.

**Tech Stack:** TypeScript, React, Vite, Node.js API server, SQLite or Postgres-compatible data layer, filesystem workspace storage, `@opencode-ai/sdk`, opencode HTTP server integration, Vitest/Playwright.

---

## File Structure

- `package.json`: workspace scripts for frontend, backend, tests, lint, and dev.
- `apps/web/`: React app for login, session sidebar, chat stream, composer, file cards, and modals.
- `apps/api/`: Node API for auth, sessions, messages, uploads, workspace management, and opencode proxy calls.
- `packages/shared/`: shared TypeScript types for users, sessions, messages, files, and opencode status.
- `storage/workspaces/`: ignored runtime directory for per-session workspaces.
- `docs/plans/2026-05-15-opencode-ai-workspace-design.md`: product/Figma design source of truth.
- `docs/plans/figma-mvp-fix-script.js`: Figma layout fix script to run once official Figma MCP write quota recovers.

## Verified Opencode Integration Source

- Local source path: `D:\protect\opencode`.
- Server docs: `D:\protect\opencode\packages\web\src\content\docs\server.mdx`.
- SDK docs: `D:\protect\opencode\packages\web\src\content\docs\sdk.mdx`.
- SDK client directory handling: `D:\protect\opencode\packages\sdk\js\src\client.ts`.
- Server workspace routing: `D:\protect\opencode\packages\opencode\src\server\routes\instance\httpapi\middleware\workspace-routing.ts`.
- Session creation uses resolved instance directory: `D:\protect\opencode\packages\opencode\src\session\session.ts`.
- Prompt file input schema: `D:\protect\opencode\packages\opencode\src\session\message-v2.ts`.

Important behavior to preserve:

- `createOpencodeClient({ baseUrl, directory })` sets `x-opencode-directory`; the SDK also rewrites GET/HEAD requests to `?directory=...`.
- `opencode serve` resolves each request from `directory`, `x-opencode-directory`, or `process.cwd()`, so our backend must always call opencode using the user-owned session workspace path.
- The app database must store both the app session ID and the opencode session ID. Never trust a session ID from the browser without checking ownership.
- File prompt parts use `{ type: "file", mime, filename, url }`. Files saved inside the workspace can be passed to opencode as `file://` URLs; image data URLs are also supported by the current opencode UI path.

## Task 1: Scaffold The Monorepo

**Files:**
- Create: `package.json`
- Create: `apps/web/package.json`
- Create: `apps/api/package.json`
- Create: `packages/shared/package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package manifests**

Create the root scripts:

```json
{
  "private": true,
  "scripts": {
    "dev": "npm-run-all --parallel dev:web dev:api",
    "dev:web": "npm --workspace apps/web run dev",
    "dev:api": "npm --workspace apps/api run dev",
    "test": "npm --workspaces run test",
    "lint": "npm --workspaces run lint",
    "typecheck": "npm --workspaces run typecheck"
  },
  "workspaces": ["apps/*", "packages/*"],
  "devDependencies": {
    "npm-run-all": "^4.1.5",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Add ignore rules**

```gitignore
node_modules/
dist/
.env
.env.local
storage/workspaces/
*.log
```

- [ ] **Step 3: Run install**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

## Task 2: Define Shared Domain Types

**Files:**
- Create: `packages/shared/src/domain.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/domain.test.ts`

- [ ] **Step 1: Write type-level domain definitions**

```ts
export type SessionStatus = "ready" | "thinking" | "running_tool" | "error";
export type MessageRole = "user" | "assistant" | "system";
export type FileKind = "image" | "video" | "document" | "spreadsheet" | "other";

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface WorkspaceSession {
  id: string;
  userId: string;
  opencodeSessionId: string;
  title: string;
  status: SessionStatus;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionFile {
  id: string;
  sessionId: string;
  name: string;
  kind: FileKind;
  mimeType: string;
  size: number;
  relativePath: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  files: SessionFile[];
  createdAt: string;
}
```

- [ ] **Step 2: Export shared types**

```ts
export * from "./domain";
```

## Task 3: Backend Auth And User Sessions

**Files:**
- Create: `apps/api/src/auth.ts`
- Create: `apps/api/src/db.ts`
- Create: `apps/api/src/server.ts`
- Test: `apps/api/src/auth.test.ts`

- [ ] **Step 1: Add failing auth tests**

Test password hashing, registration uniqueness, login success, and login failure.

- [ ] **Step 2: Implement auth storage**

Use a simple database abstraction with `users`, `password_hashes`, and HTTP-only session cookies.

- [ ] **Step 3: Verify**

Run: `npm --workspace apps/api run test`

Expected: auth tests pass.

## Task 4: Session Workspace Lifecycle

**Files:**
- Create: `apps/api/src/workspaces.ts`
- Create: `apps/api/src/sessions.ts`
- Test: `apps/api/src/workspaces.test.ts`

- [ ] **Step 1: Write workspace tests**

Assert that creating a session creates a unique directory under `storage/workspaces/<userId>/<sessionId>`.

- [ ] **Step 2: Implement workspace creation**

Use `fs.mkdir({ recursive: true })` and never accept client-provided filesystem paths.

- [ ] **Step 3: Verify isolation**

Create two sessions for one user and one session for another user. Assert all paths differ and remain inside `storage/workspaces`.

- [ ] **Step 4: Keep app session creation ready for opencode binding**

`apps/api/src/sessions.ts` should create the app session row with `opencodeSessionId` empty or nullable until Task 5 creates the opencode session. The app must not accept `workspacePath` or `opencodeSessionId` from the browser.

## Task 5: Opencode Client

**Files:**
- Create: `apps/api/src/opencodeClient.ts`
- Test: `apps/api/src/opencodeClient.test.ts`

- [ ] **Step 1: Define client interface around the real SDK**

Use `@opencode-ai/sdk` and build one scoped client per app session:

```ts
import { createOpencodeClient } from "@opencode-ai/sdk";
import { pathToFileURL } from "node:url";

export interface OpencodeSessionBinding {
  appSessionId: string;
  opencodeSessionId: string;
  workspacePath: string;
}

export interface PromptAttachmentInput {
  absolutePath: string;
  mimeType: string;
  filename: string;
}

export function opencodeForWorkspace(baseUrl: string, workspacePath: string) {
  return createOpencodeClient({
    baseUrl,
    directory: workspacePath,
    throwOnError: true,
  });
}

export async function createOpencodeSession(input: {
  baseUrl: string;
  workspacePath: string;
  title: string;
}) {
  const client = opencodeForWorkspace(input.baseUrl, input.workspacePath);
  const result = await client.session.create({ body: { title: input.title } });
  return result.data;
}

export async function sendPrompt(input: {
  baseUrl: string;
  workspacePath: string;
  opencodeSessionId: string;
  text: string;
  files: PromptAttachmentInput[];
}) {
  const client = opencodeForWorkspace(input.baseUrl, input.workspacePath);
  return await client.session.prompt({
    path: { id: input.opencodeSessionId },
    body: {
      parts: [
        ...input.files.map((file) => ({
          type: "file" as const,
          mime: file.mimeType,
          filename: file.filename,
          url: pathToFileURL(file.absolutePath).href,
        })),
        { type: "text" as const, text: input.text },
      ],
    },
  });
}
```

- [ ] **Step 2: Mock HTTP tests**

Assert that the SDK is constructed with the configured server base URL and the exact server-owned `workspacePath`. Test that `sendPrompt` sends text parts and file parts with `file://` URLs. Test that API request handlers only use `opencodeSessionId` after loading the user-owned app session from the database.

- [ ] **Step 3: Bind app sessions to opencode sessions**

When creating a new app session, call `createOpencodeSession({ baseUrl, workspacePath, title })` after the workspace directory exists, then persist the returned opencode `session.id` into `WorkspaceSession.opencodeSessionId`. If opencode creation fails, delete or mark the app session as failed so the UI never displays a session without a usable opencode binding.

- [ ] **Step 4: Add error mapping**

Map opencode failures to API errors with `status`, `message`, and retryability.

- [ ] **Step 5: Add startup health check**

At API startup, check `GET /global/health` through the SDK or plain fetch. Return a clear API boot error if `OPENCODE_BASE_URL` is unavailable.

## Task 6: File Upload API

**Files:**
- Create: `apps/api/src/files.ts`
- Test: `apps/api/src/files.test.ts`

- [ ] **Step 1: Write upload tests**

Assert uploads write only into the session workspace and reject path traversal names such as `../x`.

- [ ] **Step 2: Implement upload endpoint**

Store uploaded files under `storage/workspaces/<userId>/<sessionId>/uploads/<fileId>-<safeName>`.

- [ ] **Step 3: Create file records**

Persist name, MIME type, size, relative path, kind, and session ID.

## Task 7: Frontend Workspace UI

**Files:**
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/components/SessionSidebar.tsx`
- Create: `apps/web/src/components/ChatView.tsx`
- Create: `apps/web/src/components/Composer.tsx`
- Create: `apps/web/src/components/FileCard.tsx`
- Create: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Build the two-column shell**

Match the Figma/Codex-like layout: 280px sidebar, full-height chat area, dark surfaces, compact controls.

- [ ] **Step 2: Build chat states**

Implement empty session, normal chat, upload progress, file attachment, and error/retry states.

- [ ] **Step 3: Add tests**

Render sidebar, composer, file cards, and status pills with mocked API data.

## Task 8: End-To-End Flow

**Files:**
- Create: `apps/web/e2e/workspace.spec.ts`
- Modify: root `package.json`

- [ ] **Step 1: Add Playwright**

Install and configure Playwright for local app testing.

- [ ] **Step 2: Test user flow**

Register, create a session, send a message, upload a file, see inline file card, and revisit session history.

- [ ] **Step 3: Verify**

Run: `npm run test`

Expected: unit tests and e2e tests pass.

## Task 9: Figma Finalization

**Files:**
- Use: `docs/plans/figma-mvp-fix-script.js`
- Use Figma file: `https://www.figma.com/design/a25TzXPb0QWWEdH4sMutqY`

- [ ] **Step 1: Run Figma fix script**

When official Figma MCP write quota recovers, run the script through `use_figma`.

- [ ] **Step 2: Validate screenshots**

Capture these nodes: `02 Empty Session`, `03 Chat`, `04 Uploading Files`, and `05 File Attachments`.

- [ ] **Step 3: Compare implementation**

Use the cached Figma MCP for read-heavy design context and official Figma MCP only for final screenshots.

## Self-Review

Spec coverage:

- Auth is covered in Task 3.
- Per-session isolated workspaces are covered in Task 4.
- Opencode-only backend integration is covered in Task 5.
- File upload and inline file records are covered in Task 6.
- Codex-like two-column UI is covered in Task 7.
- History and end-to-end usage are covered in Task 8.
- Figma final cleanup is covered in Task 9.

Placeholder scan:

- No task uses `TBD` or deferred unspecified implementation.

Type consistency:

- Shared `WorkspaceSession`, `SessionFile`, and `ChatMessage` are the contract for backend and frontend tasks.
