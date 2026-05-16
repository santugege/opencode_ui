# Task Plan: Start And Verify Opencode Services

## Goal
Start the `D:\protect\opencode` backend and the current `D:\protect\opencode_ui` service, then verify the main application functionality is usable end to end.

## Current Phase
Phase 4

## Phases

### Phase 1: Discovery
- [x] Identify backend startup command
- [x] Identify frontend/current service startup command
- [x] Identify available automated tests and health checks
- **Status:** complete

### Phase 2: Start Services
- [x] Start backend service from `D:\protect\opencode`
- [x] Start current UI service from `D:\protect\opencode_ui`
- [x] Confirm ports and health endpoints respond
- **Status:** complete

### Phase 3: Functional Verification
- [x] Run available automated checks
- [x] Exercise the running UI in a browser
- [x] Check browser console or server logs for obvious errors
- **Status:** complete

### Phase 4: Delivery
- [x] Summarize service URLs, test results, and any gaps
- [x] Keep services running if useful for the user
- **Status:** complete

## Key Questions
1. What exact commands start the backend and UI services?
2. Which URLs and API endpoints prove the services are healthy?
3. What test suite or browser flows cover "functionality completeness" best in this repo?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use local plan files | This task spans startup, diagnostics, and verification across two projects. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| PowerShell nested `$_` and `$null` were expanded before inner command execution | 1 | Switch to single-quoted inner command or avoid nested PowerShell variable expansion. |
| PowerShell string output containing `/` and `=>` lost quotes after shell nesting | 2 | Use `curl.exe` and simpler one-purpose commands for health probes. |
| Start-Process script lost `$backendOut`/`$backendErr` before child PowerShell execution | 3 | Use single-quoted inner PowerShell command so variables are evaluated only in the child process. |
| Process listing script lost `$_` before child PowerShell execution | 4 | Use port/log evidence and encoded scripts for variable-heavy PowerShell. |
| In-app browser verification timed out | 1 | Use terminal Playwright to verify the live local page and console errors. |
| Playwright CLI upload requires file chooser modal state | 1 | Trigger attach first or use Playwright file input code for the generated test file. |
| PowerShell `2>NUL` redirection failed during `rg` | 1 | Use native PowerShell error handling or avoid redirection in future searches. |

## Notes
- Use `rtk` for shell commands per local instruction.
- Update findings and progress as services and test results are discovered.
- New user request: certify completeness through a real user path, not direct API calls.
