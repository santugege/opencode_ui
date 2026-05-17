import type { FastifyPluginAsync } from "fastify";
import { ApiHttpError } from "../app/errors";
import { clearSessionCookie, type AuthService } from "../services/auth.service";
import { requireCurrentUser } from "./guards";

/**
 * 认证路由需要的依赖。
 */
export interface AuthRoutesOptions {
  /** 所有认证端点使用的认证服务。 */
  auth: AuthService;
}

interface CredentialsBody {
  /** 用户提交的邮箱地址。 */
  email?: string;
  /** 用户提交的明文密码。 */
  password?: string;
}

/**
 * 注册认证相关路由。
 */
export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  app.post<{ Body: CredentialsBody }>("/auth/register", async (request, reply) => {
    const body = request.body ?? {};
    if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password) {
      throw new ApiHttpError(400, "Email and password are required.");
    }

    const email = body.email.trim();
    await options.auth.register(email, body.password);
    const login = await options.auth.login(email, body.password);
    reply.code(201).header("set-cookie", login.cookie);
    return { user: serializePublicUser(login.user) };
  });

  app.post<{ Body: CredentialsBody }>("/auth/login", async (request, reply) => {
    const body = request.body ?? {};
    if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password) {
      throw new ApiHttpError(400, "Email and password are required.");
    }

    const login = await options.auth.login(body.email.trim(), body.password);
    reply.header("set-cookie", login.cookie);
    return { user: serializePublicUser(login.user) };
  });

  app.post("/auth/logout", async (_request, reply) => {
    reply.header("set-cookie", clearSessionCookie());
    return { ok: true };
  });

  app.get("/auth/me", async (request) => {
    const current = requireCurrentUser(options.auth, request);
    return { user: serializePublicUser(current.user) };
  });
};

function serializePublicUser(user: { email: string }) {
  return {
    email: user.email,
  };
}
