import type { ExecutableAgentRole, ProjectPlan, ProjectTaskPlan } from "./types";

export const SPECIALIST_AGENT_ROLES = [
  "ux-research",
  "database",
  "api-integration",
  "security",
  "performance",
  "devops",
  "accessibility",
  "test-automation",
] as const satisfies readonly ExecutableAgentRole[];

export const SPECIALIST_ROUTING_POLICY = {
  id: "specialist-agent-routing" as const,
  version: "2.0.0",
  summary: "기존 PM Task를 다시 쪼개지 않고 전문성이 명확한 구현·연구 Task를 전문 Agent에게 우선 라우팅합니다.",
  rules: [
    "PM이 만든 Task 수와 dependency DAG는 유지하고 role ownership만 전문 Agent로 이동합니다.",
    "일반 Backend/Frontend/Designer/Idea 구현은 기존 Agent에 남기고 전문 신호가 명확한 Task만 이동합니다.",
    "UX Research routing은 user research, persona, usability, interview 신호가 명확한 Idea/Designer Task에 적용합니다.",
    "Security routing은 인증·권한·secret·공격 표면 신호가 명확한 Backend Task에 적용합니다.",
    "Database routing은 schema·migration·query·persistence 신호가 명확한 Backend Task에 적용합니다.",
    "API Integration routing은 external API·webhook·SDK·third-party integration 신호가 명확한 Backend Task에 적용합니다.",
    "Performance routing은 latency·cache·bundle·rendering·query cost 신호가 명확한 Frontend/Backend Task에 적용합니다.",
    "DevOps routing은 CI/CD·container·deployment·infrastructure·observability 신호가 명확한 Backend Task에 적용합니다.",
    "Accessibility routing은 accessibility·a11y·ARIA·keyboard·focus·screen reader 신호가 명확한 Frontend/Designer Task에 적용합니다.",
    "Test Automation routing은 unit/integration/E2E automation·regression suite 신호가 명확한 Frontend/Backend Task에 적용합니다.",
    "동시 실행 수와 wave scheduling 상한은 이 정책에서 변경하지 않습니다.",
  ],
};

const UX_RESEARCH_SIGNALS = [
  "ux research",
  "user research",
  "persona",
  "usability",
  "user interview",
  "interview",
  "research-plan",
];

const SECURITY_SIGNALS = [
  "security",
  "secure",
  "auth",
  "authentication",
  "authorization",
  "oauth",
  "permission",
  "session",
  "csrf",
  "secret",
  "credential",
];

const DATABASE_SIGNALS = [
  "database",
  "db-",
  "schema",
  "migration",
  "query",
  "postgres",
  "mysql",
  "sqlite",
  "sql",
  "persistence",
  "persistent",
];

const API_INTEGRATION_SIGNALS = [
  "external-api",
  "external api",
  "third-party",
  "third party",
  "webhook",
  "sdk integration",
  "api integration",
  "provider api",
];

const PERFORMANCE_SIGNALS = [
  "performance",
  "latency",
  "cache",
  "caching",
  "bundle",
  "render performance",
  "query cost",
  "slow query",
  "throughput",
  "profiling",
];

const DEVOPS_SIGNALS = [
  "devops",
  "deploy",
  "deployment",
  "ci-",
  "cd-",
  "pipeline",
  "docker",
  "container",
  "infrastructure",
  "infra-",
  "observability",
  "monitoring",
];

const ACCESSIBILITY_SIGNALS = [
  "accessibility",
  "a11y",
  "aria",
  "keyboard",
  "focus",
  "screen-reader",
  "screen reader",
  "contrast",
  "semantic-html",
];

const TEST_AUTOMATION_SIGNALS = [
  "test automation",
  "automated test",
  "regression suite",
  "e2e test",
  "end-to-end test",
  "integration test suite",
  "unit test suite",
  "playwright",
  "cypress",
];

function normalizedTaskText(task: ProjectTaskPlan) {
  return [task.taskSlug, task.title, task.summary, ...task.acceptanceCriteria]
    .join(" ")
    .toLowerCase();
}

function matchesAny(text: string, signals: readonly string[]) {
  return signals.some((signal) => text.includes(signal));
}

function specialistRoleForTask(task: ProjectTaskPlan): ExecutableAgentRole | null {
  const text = normalizedTaskText(task);

  if ((task.role === "idea" || task.role === "designer")
    && matchesAny(text, UX_RESEARCH_SIGNALS)) {
    return "ux-research";
  }

  if ((task.role === "frontend" || task.role === "designer")
    && matchesAny(text, ACCESSIBILITY_SIGNALS)) {
    return "accessibility";
  }

  if (task.role === "frontend") {
    if (matchesAny(text, TEST_AUTOMATION_SIGNALS)) return "test-automation";
    if (matchesAny(text, PERFORMANCE_SIGNALS)) return "performance";
    return null;
  }

  if (task.role !== "backend") return null;
  if (matchesAny(text, SECURITY_SIGNALS)) return "security";
  if (matchesAny(text, DATABASE_SIGNALS)) return "database";
  if (matchesAny(text, DEVOPS_SIGNALS)) return "devops";
  if (matchesAny(text, API_INTEGRATION_SIGNALS)) return "api-integration";
  if (matchesAny(text, TEST_AUTOMATION_SIGNALS)) return "test-automation";
  if (matchesAny(text, PERFORMANCE_SIGNALS)) return "performance";
  return null;
}

export function routeSpecialistAgentTasks(plan: ProjectPlan): ProjectPlan {
  let changed = false;
  const tasks = plan.tasks.map((task) => {
    const specialistRole = specialistRoleForTask(task);
    if (!specialistRole || specialistRole === task.role) return task;
    changed = true;
    return { ...task, role: specialistRole };
  });

  return changed ? { ...plan, tasks } : plan;
}
