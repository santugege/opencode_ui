import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { User } from "@opencode-ui/shared";
import type { MemoryDatabase, UserSessionRecord } from "./db";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE_NAME = "opencode_ui_session";

export type AuthErrorCode = "EMAIL_ALREADY_REGISTERED" | "INVALID_CREDENTIALS";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface LoginResult {
  user: User;
  session: UserSessionRecord;
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

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export function parseSessionCookie(cookie: string) {
  const pair = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!pair) return undefined;
  return decodeURIComponent(pair.slice(SESSION_COOKIE_NAME.length + 1));
}

export function createAuthService(db: MemoryDatabase) {
  return {
    async register(email: string, password: string) {
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
    },

    async verifyPassword(userId: string, password: string) {
      const passwordRecord = db.getPasswordHashByUserId(userId);
      if (!passwordRecord) return false;
      return await comparePassword(password, passwordRecord.passwordHash);
    },

    async login(email: string, password: string): Promise<LoginResult> {
      const user = db.findUserByEmail(normalizeEmail(email));
      if (!user || !(await this.verifyPassword(user.id, password))) {
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
    },
  };
}
