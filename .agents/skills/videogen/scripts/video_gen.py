#!/usr/bin/env python3
"""Create Volcengine Ark video generation tasks."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


def load_json_argument(value: str) -> Any:
    if value == "-":
        return json.load(sys.stdin)
    if value.startswith("@"):
        with open(value[1:], "r", encoding="utf-8-sig") as file:
            return json.load(file)
    return json.loads(value)


def has_builder_content(args: argparse.Namespace) -> bool:
    return any(
        [
            args.prompt,
            args.first_frame_url,
            args.last_frame_url,
            args.reference_image_url,
            args.reference_video_url,
            args.reference_audio_url,
        ]
    )


def build_content(args: argparse.Namespace, parser: argparse.ArgumentParser) -> list[dict[str, Any]]:
    if args.content_json:
        if has_builder_content(args):
            parser.error("--content-json cannot be combined with --prompt or URL content flags")
        content = load_json_argument(args.content_json)
        if not isinstance(content, list) or not content:
            parser.error("--content-json must be a non-empty JSON array")
        return content

    content: list[dict[str, Any]] = []

    if args.prompt:
        content.append({"type": "text", "text": args.prompt})

    if args.first_frame_url:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": args.first_frame_url},
                "role": "first_frame",
            }
        )

    if args.last_frame_url:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": args.last_frame_url},
                "role": "last_frame",
            }
        )

    for url in args.reference_image_url or []:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": url},
                "role": "reference_image",
            }
        )

    for url in args.reference_video_url or []:
        content.append(
            {
                "type": "video_url",
                "video_url": {"url": url},
                "role": "reference_video",
            }
        )

    for url in args.reference_audio_url or []:
        content.append(
            {
                "type": "audio_url",
                "audio_url": {"url": url},
                "role": "reference_audio",
            }
        )

    if not content:
        parser.error("provide --prompt, URL content flags, or --content-json")

    return content


def build_body(args: argparse.Namespace, parser: argparse.ArgumentParser) -> dict[str, Any]:
    model = args.model or os.environ.get("ARK_VIDEO_MODEL")
    if not model:
        parser.error("provide --model or set ARK_VIDEO_MODEL")

    body: dict[str, Any] = {
        "model": model,
        "content": build_content(args, parser),
    }

    for field in ("resolution", "ratio", "duration", "seed"):
        value = getattr(args, field)
        if value is not None:
            body[field] = value

    if args.watermark:
        body["watermark"] = True

    return body


def post_json(base_url: str, path: str, api_key: str, body: dict[str, Any]) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {exc.reason}: {error_body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"request failed: {exc.reason}") from exc

    try:
        result = json.loads(response_body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"response is not valid JSON: {response_body}") from exc

    if not isinstance(result, dict):
        raise RuntimeError("response JSON must be an object")

    return result


def create(args: argparse.Namespace, parser: argparse.ArgumentParser) -> int:
    api_key = os.environ.get("ARK_API_KEY")
    if not api_key:
        parser.error("ARK_API_KEY is required in the environment")

    body = build_body(args, parser)
    result = post_json(args.base_url, "/contents/generations/tasks", api_key, body)

    print(json.dumps(result, ensure_ascii=False, indent=2))

    task_id = result.get("id")
    if not isinstance(task_id, str) or not task_id:
        raise RuntimeError("response is missing top-level string field: id")

    print(f"\nTask ID: {task_id}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create Volcengine Ark video generation tasks")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_parser = subparsers.add_parser("create", help="create a video generation task")
    create_parser.add_argument("--base-url", default=os.environ.get("ARK_BASE_URL", DEFAULT_BASE_URL))
    create_parser.add_argument("--model", help="video generation model id; defaults to ARK_VIDEO_MODEL")
    create_parser.add_argument("--prompt", help="text prompt to add as a content item")
    create_parser.add_argument("--content-json", help="official content JSON array, raw JSON, @file, or - for stdin")

    create_parser.add_argument("--first-frame-url", help="image URL with role first_frame")
    create_parser.add_argument("--last-frame-url", help="image URL with role last_frame")
    create_parser.add_argument("--reference-image-url", action="append", help="repeatable image URL with role reference_image")
    create_parser.add_argument("--reference-video-url", action="append", help="repeatable video URL with role reference_video")
    create_parser.add_argument("--reference-audio-url", action="append", help="repeatable audio URL with role reference_audio")

    create_parser.add_argument("--resolution", choices=("480p", "720p", "1080p"))
    create_parser.add_argument("--ratio", choices=("16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"))
    create_parser.add_argument("--duration", type=int)
    create_parser.add_argument("--seed", type=int)
    create_parser.add_argument("--watermark", action="store_true")
    create_parser.set_defaults(func=create)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args, parser)
    except (json.JSONDecodeError, OSError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
