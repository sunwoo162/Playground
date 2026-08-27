import { z } from "zod";
import { dateOnlySchema } from "./date";

export const VAULT_CATEGORIES = [
  "online_purchase",
  "subscription",
  "rental",
  "membership",
  "used_goods",
  "warranty_service",
  "other",
] as const;

export type VaultCategory = (typeof VAULT_CATEGORIES)[number];

export const createVaultItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(VAULT_CATEGORIES),
  merchantName: z.string().trim().min(1).max(120),
  purchaseOrStartDate: dateOnlySchema,
  amount: z.number().int().nonnegative().max(9_999_999_999).optional(),
  currency: z.literal("KRW").default("KRW"),
  description: z.string().trim().max(2000).optional(),
});

export type CreateVaultItemInput = z.infer<typeof createVaultItemSchema>;
