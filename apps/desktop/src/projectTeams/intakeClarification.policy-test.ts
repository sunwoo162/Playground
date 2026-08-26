import {
  MAX_INTAKE_CLARIFICATION_ROUNDS,
  appendProductOwnerClarification,
  formatIntakeClarificationPrompt,
  intakeNeedsClarification,
} from "./intakeClarification";
import type { ProjectIntakeRecord } from "./types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function intake(missingInputs: string[]): ProjectIntakeRecord {
  return {
    id: "INTAKE-TEST",
    agentVersion: "1.0.0",
    summary: "test intake",
    primaryUser: "test user",
    primaryJob: "test job",
    complexity: "medium",
    requiredRoles: ["frontend", "backend", "qa"],
    criticalRoles: ["backend"],
    needsAuth: false,
    userFacing: true,
    externalDependencies: [],
    riskFlags: [],
    assumptions: [],
    missingInputs,
    rationaleSummary: "test rationale",
    sessionId: null,
    eventsPath: "events.jsonl",
    outputPath: "output.json",
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

function run() {
  {
    const ready = intake([]);
    assert(!intakeNeedsClarification(ready), "empty missingInputs must allow allocation");
  }

  {
    const blocked = intake(["지원해야 하는 결제 국가를 확인해야 합니다."]);
    assert(intakeNeedsClarification(blocked), "blocking missing input must stop allocation");
    assert(
      formatIntakeClarificationPrompt(blocked).startsWith("1."),
      "clarification prompt must enumerate missing inputs",
    );
  }

  {
    const previous = intake(["실시간 알림 채널을 어떤 방식으로 제공할지 확인해야 합니다."]);
    const refined = appendProductOwnerClarification(
      "실시간 협업 서비스를 만들어줘",
      previous,
      "웹 푸시만 지원하면 됩니다.",
      1,
    );
    assert(refined.includes("실시간 협업 서비스를 만들어줘"), "original request must be preserved");
    assert(refined.includes("웹 푸시만 지원하면 됩니다."), "Product Owner answer must be preserved");
    assert(refined.includes(previous.id), "intake lineage must remain auditable in refinement input");
  }

  {
    let threw = false;
    try {
      appendProductOwnerClarification("test", intake(["question"]), "   ", 1);
    } catch {
      threw = true;
    }
    assert(threw, "empty clarification answer must be rejected");
  }

  assert(MAX_INTAKE_CLARIFICATION_ROUNDS === 3, "clarification loop must have a finite retry cap");
  console.log("PASS  Luna intake clarification policy scenarios passed.");
}

run();
