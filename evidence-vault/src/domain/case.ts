import { z } from "zod";

export const CASE_TYPES = [
  "return_refund",
  "recurring_payment",
  "rental_contract",
  "delivery",
  "used_goods",
  "warranty_repair",
  "other",
] as const;

export const caseTypeSchema = z.enum(CASE_TYPES);
export type CaseType = (typeof CASE_TYPES)[number];
