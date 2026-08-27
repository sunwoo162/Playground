import { describe, expect, it } from "vitest";
import { createPkceAttempt, statesMatch } from "./pkce";

describe("PKCE S256", () => {
  it("creates a verifier, S256 challenge, and independent state", () => {
    const attempt = createPkceAttempt();
    expect(attempt.verifier.length).toBeGreaterThanOrEqual(43);
    expect(attempt.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.challenge).not.toBe(attempt.verifier);
  });

  it("compares state without accepting missing or modified values", () => {
    const { state } = createPkceAttempt();
    expect(statesMatch(state, state)).toBe(true);
    expect(statesMatch(state, `${state}x`)).toBe(false);
    expect(statesMatch(state, "")).toBe(false);
  });
});
