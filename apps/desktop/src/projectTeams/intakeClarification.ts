import type { ProjectIntakeRecord } from "./types";

const STORAGE_KEY = "luna.project-intake.pending.v1";
export const MAX_INTAKE_CLARIFICATION_ROUNDS = 3;

export type PendingIntakeClarification = {
  request: string;
  intake: ProjectIntakeRecord;
  round: number;
  updatedAt: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function intakeNeedsClarification(intake: ProjectIntakeRecord) {
  return intake.missingInputs.some((item) => item.trim().length > 0);
}

export function intakeClarificationQuestions(intake: ProjectIntakeRecord) {
  return intake.missingInputs
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function formatIntakeClarificationPrompt(intake: ProjectIntakeRecord) {
  const questions = intakeClarificationQuestions(intake);
  if (questions.length === 0) return "추가 확인이 필요하지 않습니다.";
  return questions.map((question, index) => `${index + 1}. ${question}`).join(" / ");
}

export function appendProductOwnerClarification(
  request: string,
  intake: ProjectIntakeRecord,
  answer: string,
  round: number,
) {
  const normalizedAnswer = answer.trim();
  if (!normalizedAnswer) {
    throw new Error("Project Intake 확인 답변을 입력해 주세요.");
  }

  const questions = intakeClarificationQuestions(intake);
  const questionContext = questions.length > 0
    ? questions.map((question, index) => `${index + 1}. ${question}`).join("\n")
    : "No outstanding intake questions were recorded.";

  return [
    request.trim(),
    "",
    `[Product Owner clarification round ${round} for Luna Project Intake ${intake.id}]`,
    "Questions raised by the organization intake:",
    questionContext,
    "Product Owner answer:",
    normalizedAnswer,
    "Treat the answer above as explicit Product Owner input. Re-evaluate earlier assumptions and only keep missingInputs that still must be resolved before team allocation or meaningful PM planning.",
  ].join("\n");
}

export function loadPendingIntakeClarification(): PendingIntakeClarification | null {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingIntakeClarification;
    if (!parsed
      || typeof parsed.request !== "string"
      || typeof parsed.round !== "number"
      || !parsed.intake
      || !Array.isArray(parsed.intake.missingInputs)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePendingIntakeClarification(
  pending: PendingIntakeClarification,
) {
  const next: PendingIntakeClarification = {
    ...pending,
    request: pending.request.trim(),
    updatedAt: new Date().toISOString(),
  };
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function clearPendingIntakeClarification() {
  if (canUseStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
