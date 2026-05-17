# opencode network/API notes

This file documents network and credential setup for the `scripts/image_gen.py` CLI workflow.

This guidance is intentionally isolated from `SKILL.md` because network and shell setup varies by environment. Prefer the active opencode environment and local security policy when in doubt.

## Requirements
- The CLI uses the OpenAI Image API, so it needs outbound network access.
- Live API calls require `IMAGE_GEN_API_KEY`, `OPENAI_API_KEY`, or `--api-key`.
- OpenAI-compatible gateways may use `IMAGE_GEN_BASE_URL`, `OPENAI_BASE_URL`, or `--base-url`.
- `--dry-run` does not require network access or the `openai` Python package.

## API key handling
- Never ask the user to paste the full API key in chat.
- Ask the user to set `IMAGE_GEN_API_KEY` or `OPENAI_API_KEY` locally and confirm when ready.
- If the key is missing, explain how to set it for their OS/shell instead of embedding it in a script or config file.

PowerShell example:

```powershell
$env:IMAGE_GEN_API_KEY = "..."
$env:IMAGE_GEN_BASE_URL = "https://example.com/v1"
```

Bash example:

```bash
export IMAGE_GEN_API_KEY="..."
export IMAGE_GEN_BASE_URL="https://example.com/v1"
```

## Network and approvals
- If the CLI cannot reach the API, verify network access from the opencode process environment.
- If opencode asks for approval before running a networked command, follow the current session's permission policy.
- Do not bypass local approval, sandbox, or permission rules unless the user explicitly asks for that change.

## Safety note
Enabling network and reducing approvals lowers friction, but increases risk if you run untrusted code or work in an untrusted repository.
