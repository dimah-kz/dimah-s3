import { describe, expect, it } from "vitest";
import { hashPassword, passwordTag, verifyPassword } from "./password";

describe("link passwords", () => {
  it("verifies the password it hashed, and nothing else", async () => {
    const stored = await hashPassword("open sesame");
    expect(stored).toMatch(/^pbkdf2-sha256\$600000\$[\w-]+\$[\w-]+$/);
    await expect(verifyPassword("open sesame", stored)).resolves.toBe(true);
    await expect(verifyPassword("open sesame!", stored)).resolves.toBe(false);
  });

  it("salts each hash", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same"),
      hashPassword("same"),
    ]);
    expect(a).not.toBe(b);
  });

  it("compares Unicode in one normal form", async () => {
    const stored = await hashPassword("café");
    await expect(verifyPassword("café", stored)).resolves.toBe(true);
  });

  it("rejects a malformed or out-of-range stored hash", async () => {
    for (const stored of [
      "",
      "bcrypt$1$a$b",
      "pbkdf2-sha256$10$a$b",
      "pbkdf2-sha256$99999999999$a$b",
      "pbkdf2-sha256$600000$!!$b",
    ]) {
      await expect(verifyPassword("x", stored)).resolves.toBe(false);
    }
  });

  it("tags a hash without revealing it", async () => {
    const stored = await hashPassword("open sesame");
    const tag = await passwordTag(stored);
    expect(tag).toHaveLength(16);
    expect(stored).not.toContain(tag);
    await expect(passwordTag(stored)).resolves.toBe(tag);
    await expect(
      passwordTag(await hashPassword("open sesame")),
    ).resolves.not.toBe(tag);
  });
});
