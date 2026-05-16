import type { FastifyInstance } from "fastify";
import { AuthError } from "../services/auth.service";
import { isOpencodeApiError } from "../services/opencode.service";

/**
 * 路由层在确认客户端请求错误后抛出的显式 HTTP 错误。
 */
export class ApiHttpError extends Error {
  constructor(
    /** 返回给客户端的 HTTP 状态码。 */
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

/**
 * 为所有 Fastify 路由注册统一的 JSON 错误处理器。
 */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      const status = error.code === "EMAIL_ALREADY_REGISTERED" ? 409 : 401;
      reply.code(status).send({ error: error.message });
      return;
    }

    if (error instanceof ApiHttpError) {
      reply.code(error.statusCode).send({ error: error.message });
      return;
    }

    if (isOpencodeApiError(error)) {
      reply.code(error.status).send({ error: error.message, retryable: error.retryable });
      return;
    }

    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number") {
      reply.code(statusCode).send({ error: error.message });
      return;
    }

    if (error instanceof Error) {
      reply.code(500).send({ error: error.message });
      return;
    }

    reply.code(500).send({ error: "Non-Error exception thrown by API route." });
  });
}
