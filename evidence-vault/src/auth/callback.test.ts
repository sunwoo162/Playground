import { describe, expect, it } from "vitest";
import { openLoginAttempt, sanitizeReturnTo, sealLoginAttempt } from "./login-attempt";

const secret = "0123456789abcdef0123456789abcdef";

describe("OAuth login attempt", () => {
  it("round-trips a short-lived encrypted attempt", () => {
    const expiresAt = Date.now() + 60_000;
    const sealed = sealLoginAttempt({ state: "state-value", verifier: "verifier-value", returnTo: "/dashboard", expiresAt }, secret);
    expect(openLoginAttempt(sealed, secret, expiresAt - 1)).toEqual({
      state: "state-value",
      verifier: "verifier-value",
      returnTo: "/dashboard",
      expiresAt,
    });
  });

  it("rejects expired attempts", () => {
    const expiresAt = Date.now() - 1;
    const sealed = sealLoginAttempt({ state: "state-value", verifier: "verifier-value", returnTo: "/dashboard", expiresAt }, secret);
    expect(() => openLoginAttempt(sealed, secret, Date.now())).toThrow("oauth_attempt_expired");
  });

  it("allows only internal return paths", () => {
    expect(sanitizeReturnTo("/vault/abc?tab=files")).toBe("/vault/abc?tab=files");
    expect(sanitizeReturnTo("https://evil.example/steal")).toBe("/dashboard");
    expect(sanitizeReturnTo("//evil.example/steal")).toBe("/dashboard");
    expect(sanitizeReturnTo("/\\evil.example/steal")).toBe("/dashboard");
  });
});
