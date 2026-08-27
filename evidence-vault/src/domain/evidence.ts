import { z } from "zod";
import { dateOnlySchema } from "./date";

export const EVIDENCE_EVENT_TYPES = [
  "purchased",
  "delivered",
  "defect_found",
  "refund_requested",
  "merchant_replied",
  "refund_received",
  "payment_made",
  "contract_signed",
  "custom",
] as const;

export const createEvidenceEventSchema = z.object({
  occurredOn: dateOnlySchema,
  eventType: z.enum(EVIDENCE_EVENT_TYPES),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(4000).optional(),
});

export type EvidenceEventType = (typeof EVIDENCE_EVENT_TYPES)[number];
export type CreateEvidenceEventInput = z.infer<typeof createEvidenceEventSchema>;
