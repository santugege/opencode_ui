import type { FastifyRequest } from "fastify";
import { ApiHttpError } from "../app/errors";
import type { AuthService, CurrentUser } from "../services/auth.service";

/**
 * 解析当前已认证用户，未认证时以 401 失败。
 */
export function requireCurrentUser(auth: AuthService, request: FastifyRequest): CurrentUser {
  const current = auth.currentUser(request.headers.cookie);
  if (!current) throw new ApiHttpError(401, "Authentication required.");
  return current;
}
