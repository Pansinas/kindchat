import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/api-client";
import { friendlyError } from "@/lib/domain/errors";
import { displayNameSchema, registerSchema, usernameSchema } from "@/lib/domain/validation";

describe("usernames", () => {
  it.each(["abc", "Maya_R", "user_123", "A".repeat(20)])("accepts %s", (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(true);
  });
  it.each(["ab", "A".repeat(21), "has space", "dash-name", "émile", "аdmin" /* Cyrillic а */])("rejects %s", (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(false);
  });
});

describe("registration", () => {
  const base = { username: "maya", displayName: "Maya", password: "a-long-password", confirmPassword: "a-long-password" };
  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });
  it("requires matching passwords", () => {
    expect(registerSchema.safeParse({ ...base, confirmPassword: "different-pass" }).success).toBe(false);
  });
  it("requires 10+ character passwords", () => {
    expect(registerSchema.safeParse({ ...base, password: "short", confirmPassword: "short" }).success).toBe(false);
  });
  it("allows an empty optional recovery email", () => {
    expect(registerSchema.safeParse({ ...base, recoveryEmail: "" }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, recoveryEmail: "nope" }).success).toBe(false);
  });
});

describe("display names", () => {
  it("rejects bidi override characters used for spoofing", () => {
    expect(displayNameSchema.safeParse("Maya‮evil").success).toBe(false);
  });
});

describe("safeNext", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });
});

describe("friendlyError", () => {
  it("maps RPC error codes to copy and never leaks raw errors", () => {
    expect(friendlyError({ message: "ALREADY_PAIRED" })).toMatch(/already connected/);
    expect(friendlyError({ message: "duplicate key value violates unique constraint" })).toBe("Something went wrong. Please try again.");
  });
});
