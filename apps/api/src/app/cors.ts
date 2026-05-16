import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * 为显式配置的来源写入允许携带凭证的 CORS 响应头。
 */
export function applyCorsHeaders(request: FastifyRequest, reply: FastifyReply, allowedOrigins: Set<string>) {
  const origin = headerValue(request.headers.origin);
  if (!origin || !allowedOrigins.has(origin)) {
    return;
  }

  reply.header("access-control-allow-credentials", "true");
  reply.header("access-control-allow-headers", headerValue(request.headers["access-control-request-headers"]) ?? "content-type");
  reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
  reply.header("access-control-allow-origin", origin);
  reply.header("vary", "Origin");
}

function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(", ");
  return value;
}
