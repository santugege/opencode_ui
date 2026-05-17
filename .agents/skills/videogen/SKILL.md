---
name: "videogen"
description: "Video generation, videogen, Seedance, Volcengine Ark video tasks, 火山方舟视频生成, 视频生成: use ONLY when creating Volcengine Ark video generation tasks via POST /contents/generations/tasks. This create-only skill does not query, poll, download, delete, or edit videos."
---

# Video Generation Skill

Creates Volcengine Ark video generation tasks through the official async create endpoint.

## Scope

Use this skill only to create a video generation task and return the task id.

Supported:
- Text-to-video task creation.
- Image/video/audio reference URL inputs for task creation.
- Direct official `content` array input with `--content-json`.

Not supported by this skill yet:
- Querying task status.
- Polling or waiting for completion.
- Downloading generated videos.
- Cancelling or deleting tasks.
- Editing existing videos locally.

If the user asks for any unsupported operation, state that the current `videogen` skill is create-only and ask whether to extend the skill.

## API

Create task endpoint:

```text
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
```

Authentication:
- Use `Authorization: Bearer $ARK_API_KEY`.
- Require `ARK_API_KEY` in the environment before making live calls.
- Do not ask the user to paste the full API key in chat.

Required request body fields:
- `model`: model id, for example `doubao-seedance-2-0-260128`.
- `content`: official content array.

Common optional fields exposed by the CLI:
- `resolution`: `480p`, `720p`, or `1080p`.
- `ratio`: `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `21:9`, or `adaptive`.
- `duration`: integer seconds.
- `seed`: integer seed.
- `watermark`: boolean, only sent when enabled.

The create response returns the task id at top-level `id`.

## Execution

Use the bundled CLI:

```bash
python "<skill-dir>/scripts/video_gen.py" create --model <model-id> --prompt "<prompt>"
```

The CLI prints the raw JSON response and then prints `Task ID: <id>`.

Model selection:
- Prefer the model explicitly requested by the user.
- If the user does not specify a model, use `ARK_VIDEO_MODEL` when set.
- If neither is available, ask for the model id instead of guessing.

Prompt and content rules:
- Use `--prompt` for normal text prompts.
- Use URL flags only for externally reachable URLs. Do not pass local files as image/video/audio URLs.
- Use `--content-json` when the user provides a complete official `content` array or needs roles not represented by the simple flags.
- Do not combine `--content-json` with `--prompt` or URL builder flags.

URL flags:
- `--first-frame-url <url>` creates an image content item with role `first_frame`.
- `--last-frame-url <url>` creates an image content item with role `last_frame`.
- `--reference-image-url <url>` can be repeated and uses role `reference_image`.
- `--reference-video-url <url>` can be repeated and uses role `reference_video`.
- `--reference-audio-url <url>` can be repeated and uses role `reference_audio`.

## Workflow

1. Confirm the user wants to create a Volcengine Ark video generation task.
2. Gather `model` and at least one content input: prompt, URL input, or `content` JSON.
3. Ensure `ARK_API_KEY` is configured locally; if missing, ask the user to set it and confirm.
4. Run `scripts/video_gen.py create` with only the fields needed for this request.
5. Return the task id and raw response summary. Make clear that this skill does not query completion or download the video.

## Examples

Text-to-video:

```bash
python "<skill-dir>/scripts/video_gen.py" create \
  --model "doubao-seedance-2-0-260128" \
  --prompt "A cinematic shot of a cat watching snow by the window" \
  --resolution 720p \
  --ratio 16:9 \
  --duration 5
```

First-frame image-to-video:

```bash
python "<skill-dir>/scripts/video_gen.py" create \
  --model "doubao-seedance-2-0-260128" \
  --prompt "Animate the image with subtle camera movement" \
  --first-frame-url "https://example.com/frame.png" \
  --duration 5
```

Official content JSON:

```bash
python "<skill-dir>/scripts/video_gen.py" create \
  --model "doubao-seedance-2-0-260128" \
  --content-json '[{"type":"text","text":"A calm ocean sunset"}]'
```
