import { describe, expect, it } from "vitest";
import { healthPayload } from "./health";

describe("healthPayload", () => {
  it("identifies the Evidence Vault service", () => {
    expect(healthPayload()).toEqual({ ok: true, service: "evidence-vault" });
  });
});
