import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { User } from "@opencode-ui/shared";
import type { MemoryDatabase, UserSessionRecord } from "../repositories/memory.repository";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE_NAME = "opencode_ui_session";

export type AuthErrorCode = "EMAIL_ALREADY_REGISTERED" | "INVALID_CREDENTIALS";

/**
 * 认证失败对应的领域错误，可明确映射到 HTTP 状态码。
 */
export class AuthError extends Error {
  constructor(
    /** 机器可读的认证失败代码。 */
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * 从请求 cookie 中解析出的已认证浏览器会话。
 */
export interface CurrentUser {
  /** 来自 HTTP-only cookie 的用户会话 ID。 */
  sessionId: string;
  /** 与当前浏览器会话关联的用户记录。 */
  user: User;
}

/**
 * 登录成功后返回给认证路由的结果。
 */
export interface LoginResult {
  /** 已认证用户。 */
  user: User;
  /** 已持久化的浏览器会话记录。 */
  session: UserSessionRecord;
  /** HTTP-only Set-Cookie 响应头值。 */
  cookie: string;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function comparePassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHex] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createSessionCookie(sessionId: string) {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000",
  ].join("; ");
}

/**
 * 构造用于清除浏览器会话的 Set-Cookie 值。
 */
export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

/**
 * 从原始 Cookie 请求头中提取 API 会话 ID。
 */
export function parseSessionCookie(cookie: string) {
  const pair = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!pair) return undefined;
  return decodeURIComponent(pair.slice(SESSION_COOKIE_NAME.length + 1));
}

/**
 * 基于指定仓储创建认证服务。
 */
export function createAuthService(db: MemoryDatabase) {
  async function register(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);
    const existing = db.findUserByEmail(normalizedEmail);
    if (existing) {
      throw new AuthError("EMAIL_ALREADY_REGISTERED", "Email is already registered.");
    }

    const user = db.createUser({
      id: randomUUID(),
      email: normalizedEmail,
      createdAt: new Date().toISOString(),
    });
    db.setPasswordHash({
      userId: user.id,
      passwordHash: await hashPassword(password),
    });
    return user;
  }

  async function verifyPassword(userId: string, password: string) {
    const passwordRecord = db.getPasswordHashByUserId(userId);
    if (!passwordRecord) return false;
    return await comparePassword(password, passwordRecord.passwordHash);
  }

  async function login(email: string, password: string): Promise<LoginResult> {
    const user = db.findUserByEmail(normalizeEmail(email));
    if (!user || !(await verifyPassword(user.id, password))) {
      throw new AuthError("INVALID_CREDENTIALS", "Email or password is incorrect.");
    }

    const session = db.createUserSession({
      id: randomUUID(),
      userId: user.id,
      createdAt: new Date().toISOString(),
    });

    return {
      user,
      session,
      cookie: createSessionCookie(session.id),
    };
  }

  function currentUser(cookieHeader: string | undefined): CurrentUser | undefined {
    const sessionId = parseSessionCookie(cookieHeader ?? "");
    if (!sessionId) return undefined;

    const session = db.findUserSessionById(sessionId);
    if (!session) return undefined;

    const user = db.findUserById(session.userId);
    if (!user) return undefined;

    return { sessionId, user };
  }

  return {
    currentUser,
    login,
    register,
    verifyPassword,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
