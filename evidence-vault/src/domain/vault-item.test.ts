import { describe, expect, it } from "vitest";
import { createVaultItemSchema, VAULT_CATEGORIES } from "./vault-item";

describe("createVaultItemSchema", () => {
  it("accepts a normal consumer purchase", () => {
    const result = createVaultItemSchema.safeParse({
      title: "무선 이어폰",
      category: "online_purchase",
      merchantName: "Example Store",
      purchaseOrStartDate: "2026-08-20",
      amount: 129000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative amount", () => {
    const result = createVaultItemSchema.safeParse({
      title: "정수기",
      category: "rental",
      merchantName: "Example Rental",
      purchaseOrStartDate: "2026-08-20",
      amount: -1,
    });
    expect(result.success).toBe(false);
  });

  it("does not expose a medical dispute category in MVP", () => {
    expect(VAULT_CATEGORIES).not.toContain("medical");
    expect(VAULT_CATEGORIES).not.toContain("health");
  });
});
