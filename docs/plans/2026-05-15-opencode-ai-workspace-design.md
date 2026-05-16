# Opencode AI Workspace MVP Design

## Goal

Build a multi-user AI website that uses opencode as the only AI/agent backend. Users can register, sign in, create isolated sessions, chat, upload files, and revisit session history. The product is not project-specific and should feel closer to Codex/ChatGPT without a selected project.

## Product Scope

- Public registration and login are required.
- Billing, plans, organization roles, and advanced admin workflows are out of scope for the first version.
- Each chat session owns one isolated empty workspace.
- Files uploaded in a session belong only to that session workspace.
- There is no persistent right-side file panel. Files appear inline in the composer, messages, and preview modal.
- The app does not integrate any non-opencode AI backend.

## Recommended Architecture

Use a lightweight web backend as the application orchestration layer and run opencode behind it.

Local opencode source for this project is available at:

- `D:\protect\opencode`

Relevant verified opencode integration points:

- `opencode serve` starts a headless HTTP server with OpenAPI/SDK support.
- `@opencode-ai/sdk` exposes `createOpencodeClient({ baseUrl, directory })`.
- The SDK sets `x-opencode-directory` for the requested workspace and rewrites GET/HEAD calls to `?directory=...`.
- The server middleware in `packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts` resolves each request to a local workspace from `directory`, `x-opencode-directory`, or `process.cwd()`.
- Session creation in `packages/opencode/src/session/session.ts` stores session data under the resolved instance directory, so our app can keep session isolation by creating one empty directory per product session and always calling opencode with that directory.
- Prompt file inputs are supported through `FilePartInput` (`type: "file"`, `mime`, `filename`, `url`) alongside text parts. Uploaded workspace files can be passed as `file://` URLs, while image clipboard/drop inputs can use data URLs.

The web backend owns:

- Authentication and user sessions.
- Conversation metadata and message history.
- Per-session workspace creation and cleanup policy.
- File uploads into the session workspace.
- Permission checks before any opencode call.
- Calls into `opencode serve` for session, message, command, file, event, and agent operations.
- The mapping between app session IDs, opencode session IDs, user IDs, and workspace directories.

Opencode owns:

- AI conversation execution.
- Tool execution.
- File-aware work inside the session workspace.
- Session-level isolation at the opencode layer.

The MVP should run one shared local opencode server process in development and production, then use `createOpencodeClient({ baseUrl, directory: session.workspacePath })` per request. Starting one opencode server per chat session is unnecessary for the first version unless future load or sandboxing requirements demand process-level isolation.

## Figma Design

Figma file: https://www.figma.com/design/a25TzXPb0QWWEdH4sMutqY

Created page:

- `MVP Screens`

Created frames:

- `AI Workspace / 01 Login`
- `AI Workspace / 02 Empty Session`
- `AI Workspace / 03 Chat`
- `AI Workspace / 04 Uploading Files`
- `AI Workspace / 05 File Attachments`

Visual direction:

- Codex-like dark workspace.
- Two-column layout: session sidebar and main chat area.
- Compact, utility-focused controls.
- Inline file cards instead of a permanent file panel.
- Session status pills for `Ready`, `Thinking`, `Running tool`, and `Error`.

## Known Figma Follow-Up

The first Figma draft was generated successfully, but final validation was blocked by Figma MCP Education plan tool-call limits.

Known fixes to apply once write quota recovers:

- Move each sidebar `User Menu` back inside the 900px frame.
- Reduce each `Sidebar Spacer` height so the user menu sits at the bottom.
- Restore `AI Workspace / 05 File Attachments` main chat area to `1160 x 900`.
- Take screenshots of the empty, chat, uploading, and attachment frames to verify no clipped text or overlap.

## Implementation Notes

The first engineering version should follow the Figma structure, not treat the mockup text as final copy.

Core UI surfaces:

- Login/register screen.
- Session list sidebar.
- New session empty state.
- Message stream.
- Composer with text, attach, send, and opencode status affordances.
- Inline file attachment cards.
- Upload progress rows.
- Attachment preview modal.
- Error/retry state.
