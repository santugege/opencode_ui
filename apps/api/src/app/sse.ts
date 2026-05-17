import { once } from "node:events";
import type { ServerResponse } from "node:http";

/**
 * SSE 响应必须显式禁用缓存和代理缓冲，同时保留全局 CORS hook 写入的凭证头。
 */
export function sseHeaders(existingHeaders: Record<string, number | string | string[] | undefined>) {
  const headers: Record<string, string> = {
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
  };

  for (const [key, value] of Object.entries(existingHeaders)) {
    if (value === undefined) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  return headers;
}

/**
 * 连接建立后的错误无法再走 JSON 错误处理器，只能作为 SSE 事件通知浏览器。
 */
export async function writeSseEvent(raw: ServerResponse, event: string, data: unknown) {
  const payload = JSON.stringify(data);
  const frame = [`event: ${event}`, ...payload.split("\n").map((line) => `data: ${line}`), "", ""].join("\n");
  await writeSseChunk(raw, frame);
}

/**
 * 统一处理 Node HTTP 响应背压，避免高频 opencode 事件压垮响应缓冲区。
 */
export async function writeSseChunk(raw: ServerResponse, chunk: string | Uint8Array) {
  if (!raw.write(chunk)) await once(raw, "drain");
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "SSE stream failed.";
}
