# Findings & Decisions

## Requirements
- Start backend service in `D:\protect\opencode`.
- Start current service in `D:\protect\opencode_ui`.
- Test the completeness/integrity of the app functionality.
- Re-certify through the real human UI path: visible page, clicks, typing, file chooser, history, search, sign out, and console/log review.

## Research Findings
- `D:\protect\opencode` backend starts with `bun dev serve`; contributing docs state it listens on port `4096` by default, and `--port` can override it.
- `opencode` serve command is implemented in `packages/opencode/src/cli/cmd/serve.ts`; it starts the headless server and prints `opencode server listening on ...`.
- `opencode_ui` root scripts: `npm run dev` runs `dev:web` and `dev:api` in parallel.
- `opencode_ui` API entrypoint is `apps/api/src/main.ts`; it listens on `127.0.0.1:${PORT ?? 8787}`.
- `opencode_ui` API defaults `OPENCODE_BASE_URL` to `http://127.0.0.1:4096`.
- `opencode_ui` Web script starts Vite on `127.0.0.1`; Playwright config uses `http://127.0.0.1:5173`.
- Playwright e2e config starts API in stub mode via `OPENCODE_UI_TEST_MODE=1`, so it validates UI/API product flow without requiring live model execution.
- Main e2e flow covers register, create session, upload file, send message, and revisit session history.
- Live `opencode` backend is listening on `http://127.0.0.1:4096`.
- Backend log shows one-time database migration completed and `opencode server listening on http://127.0.0.1:4096`.
- `curl http://127.0.0.1:4096/health` returned `200 OK` with the OpenCode HTML shell, not a JSON health body.
- `npm run typecheck` passed for API, Web, and Shared workspaces.
- `npm run lint` passed for API, Web, and Shared workspaces.
- `npm run test:unit` passed: API 21 tests, Web 7 tests, Shared 4 tests.
- `npm run test:e2e` passed: Edge project ran the full register/session/upload/message/history flow successfully.
- Current UI API is listening on `http://127.0.0.1:8787`; `/health` returns `{"healthy":true}`.
- Current UI Web is listening on `http://127.0.0.1:5173` and returns Vite HTML for `Opencode AI Workspace`.
- Port ownership observed: `4096`, `8787`, and `5173` all in `Listen` state.
- Live UI API flow succeeded against `OPENCODE_BASE_URL=http://127.0.0.1:4096`: register, create session, upload `live-check.txt`, send message, and list sessions all completed.
- The live session response contained an opencode session ID, proving API-to-opencode binding was created.
- Live browser flow succeeded on `http://127.0.0.1:5173`: register, create a new session, upload `live-ui-check.txt`, send a message, and see chat/history update.
- Browser console review showed three non-blocking errors: missing `favicon.ico` and two expected pre-login `/auth/me` `401 Unauthorized` probes.
- Final port check showed `4096`, `8787`, and `5173` in `Listen` state.
- API/Web stderr logs were empty; backend stderr only contained the startup command and database migration messages.
- UI code review for real-user controls found visible `Search sessions`, `Session controls`, and `Sign out` controls; `SessionSidebar` currently renders search and sign out without behavior handlers, and `Composer` renders session controls as a button without attached behavior.
- Real browser check confirmed `Search sessions` accepts text but does not filter or otherwise update the session list.
- Real browser check confirmed `Session controls` click has no visible effect.
- Real browser check confirmed `Sign out` click has no visible effect and user remains logged in.
- Sign out fix added a real `/auth/logout` route, browser API logout call, and sidebar button wiring.
- After restarting the UI API, `POST http://127.0.0.1:8787/auth/logout` returned `200 OK` with a clear-cookie response.
- Real browser re-check for Sign out passed: registering `signout-fix-20260516-1333@example.com`, clicking `Sign out`, and reloading left the browser on the `Create account` screen with no cookies.
- Playwright network audit for the fixed path showed `POST /auth/logout => 200 OK`; subsequent `/auth/me` calls returned `401 Unauthorized`, which is expected after logout.
- Real browser reload preserved authenticated user and session history. Network after reload showed `/auth/me` 200 and `/sessions` 200.
- Human-path network audit showed expected successful requests: register 201, list sessions 200, create sessions 201, upload file 201, send messages 201.
- Current page console after reload had 0 errors and 0 warnings.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Prefer existing package scripts and repo docs | Keeps startup aligned with project conventions. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Initial health/search probe had PowerShell nested quoting errors | Re-run using single-quoted command content and avoid `2>$null` expansion. |
| Second health probe still lost string quoting around labels | Use direct `curl.exe` probes and avoid composed PowerShell label strings. |
| Process listing probe lost `$_` inside nested PowerShell and produced noisy errors | Use direct port/log checks, or encoded scripts when PowerShell variables are needed. |
| In-app browser verification timed out | Use terminal Playwright for equivalent live page and console verification. |
| Playwright CLI `upload` cannot run unless it detects related modal state | Trigger the attach control first; fallback to direct Playwright file input code if needed. |
| PowerShell `2>NUL` redirection failed during an exploratory `rg` command | Use normal command stderr handling or PowerShell-native error handling instead. |

## Resources
- `D:\protect\opencode`
- `D:\protect\opencode_ui`
- `D:\protect\opencode\CONTRIBUTING.md`
- `D:\protect\opencode_ui\playwright.config.ts`
- `D:\protect\opencode_ui\apps\api\src\main.ts`
- `D:\protect\opencode_ui\apps\api\src\server.ts`
- `D:\protect\opencode_ui\apps\web\e2e\workspace.spec.ts`

## Visual/Browser Findings
- Playwright snapshot of live page initially showed the `AI Workspace` create-account form with Email, Password, and Create account controls.
- After registering `live-ui-1778907050@example.com`, the workspace shell showed session history, New session, search, account identity, composer, and attach/send controls.
- After uploading `live-ui-check.txt` and sending `Summarize this file from the live UI verification.`, the page showed the message in the chat list, a ready file card, and the session history title updated to `Summarize this file from the`.
