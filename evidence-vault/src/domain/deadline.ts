import { z } from "zod";
import { dateOnlySchema, dateOnlyToUtcDay } from "./date";

export const DEADLINE_TYPES = [
  "return_window",
  "renewal",
  "warranty_expiry",
  "contract_end",
  "refund_expected",
  "custom",
] as const;

export const DEADLINE_SOURCE_TYPES = [
  "user_entered",
  "merchant_provided",
  "general_reference",
] as const;

export type DeadlineType = (typeof DEADLINE_TYPES)[number];
export type DeadlineSourceType = (typeof DEADLINE_SOURCE_TYPES)[number];

const labels: Record<DeadlineType, string> = {
  return_window: "반품 가능일로 기록한 날짜",
  renewal: "갱신일로 기록한 날짜",
  warranty_expiry: "보증 종료일로 기록한 날짜",
  contract_end: "약정 종료일로 기록한 날짜",
  refund_expected: "환불 예정일로 기록한 날짜",
  custom: "중요 날짜로 기록한 날짜",
};

export function deadlineLabel(type: DeadlineType): string {
  return labels[type];
}

export function daysUntil(dueDate: string, todayDate: string): number {
  return dateOnlyToUtcDay(dueDate) - dateOnlyToUtcDay(todayDate);
}

export const createDeadlineSchema = z.object({
  type: z.enum(DEADLINE_TYPES),
  dueDate: dateOnlySchema,
  sourceType: z.enum(DEADLINE_SOURCE_TYPES),
  sourceNote: z.string().trim().max(500).optional(),
});

export type CreateDeadlineInput = z.infer<typeof createDeadlineSchema>;
