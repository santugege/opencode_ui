import { describe, expect, it } from "vitest";
import { createMemoryDatabase } from "../../src/repositories/memory.repository";
import { AuthError, createAuthService, parseSessionCookie } from "../../src/services/auth.service";

describe("auth service", () => {
  it("hashes passwords without storing plaintext", async () => {
    const db = createMemoryDatabase();
    const auth = createAuthService(db);

    const user = await auth.register("person@example.com", "correct horse battery staple");
    const passwordRecord = db.getPasswordHashByUserId(user.id);

    expect(passwordRecord?.passwordHash).toBeDefined();
    expect(passwordRecord?.passwordHash).not.toContain("correct horse battery staple");
    await expect(auth.verifyPassword(user.id, "correct horse battery staple")).resolves.toBe(true);
  });

  it("rejects duplicate registrations by normalized email", async () => {
    const auth = createAuthService(createMemoryDatabase());

    await auth.register("person@example.com", "password-one");

    await expect(auth.register(" PERSON@example.com ", "password-two")).rejects.toMatchObject({
      code: "EMAIL_ALREADY_REGISTERED",
    });
  });

  it("logs in with a matching password and issues an http-only cookie", async () => {
    const auth = createAuthService(createMemoryDatabase());
    const registered = await auth.register("person@example.com", "correct horse battery staple");

    const result = await auth.login("person@example.com", "correct horse battery staple");
    const parsedCookie = parseSessionCookie(result.cookie);

    expect(result.user.id).toBe(registered.id);
    expect(result.session.userId).toBe(registered.id);
    expect(result.cookie).toContain("HttpOnly");
    expect(result.cookie).toContain("SameSite=Lax");
    expect(parsedCookie).toBe(result.session.id);
  });

  it("rejects login with an invalid password", async () => {
    const auth = createAuthService(createMemoryDatabase());

    await auth.register("person@example.com", "correct horse battery staple");

    await expect(auth.login("person@example.com", "wrong password")).rejects.toBeInstanceOf(AuthError);
    await expect(auth.login("person@example.com", "wrong password")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });
});
