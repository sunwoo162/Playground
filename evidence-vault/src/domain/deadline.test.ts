import { describe, expect, it } from "vitest";
import { daysUntil, deadlineLabel } from "./deadline";

describe("deadline semantics", () => {
  it("labels a return window as a recorded date instead of a legal conclusion", () => {
    expect(deadlineLabel("return_window")).toBe("반품 가능일로 기록한 날짜");
  });

  it("uses calendar-day arithmetic for date-only values", () => {
    expect(daysUntil("2026-08-30", "2026-08-27")).toBe(3);
    expect(daysUntil("2026-08-27", "2026-08-27")).toBe(0);
    expect(daysUntil("2026-08-25", "2026-08-27")).toBe(-2);
  });
});
