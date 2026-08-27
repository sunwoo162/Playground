import type { ExecutableAgentRole, ProjectPlan, ProjectTaskPlan } from "./types";

export const SPECIALIST_AGENT_ROLES = [
  "database",
  "security",
  "devops",
  "accessibility",
] as const satisfies readonly ExecutableAgentRole[];

const MAX_TASKS_BEFORE_MANDATORY_MARKETING = 35;

type SpecialistRole = (typeof SPECIALIST_AGENT_ROLES)[number];

type SpecialistDefinition = {
  role: SpecialistRole;
  prefix: string;
  slug: string;
  title: string;
  summary: string;
  acceptanceCriteria: string[];
  shouldActivate: (plan: ProjectPlan, text: string) => boolean;
  dependencyRoles: ExecutableAgentRole[];
};

function normalizedPlanText(plan: ProjectPlan) {
  return [
    plan.productSummary,
    plan.architectureSummary,
    ...plan.technologyDecisions.flatMap((decision) => [decision.area, decision.choice, decision.reason]),
    ...plan.tasks.flatMap((task) => [task.title, task.summary, ...task.acceptanceCriteria]),
  ].join(" ").toLowerCase();
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function hasAnyRole(plan: ProjectPlan, roles: ExecutableAgentRole[]) {
  return plan.tasks.some((task) => roles.includes(task.role));
}

function nextTaskId(tasks: ProjectTaskPlan[], prefix: string) {
  const used = new Set(tasks.map((task) => task.id));
  for (let index = 1; index <= 999; index += 1) {
    const candidate = `${prefix}-${String(index).padStart(3, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`${prefix} specialist Task ID를 생성할 수 없습니다.`);
}

function nextTaskSlug(tasks: ProjectTaskPlan[], base: string) {
  const used = new Set(tasks.map((task) => task.taskSlug));
  if (!used.has(base)) return base;
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`${base} specialist taskSlug를 생성할 수 없습니다.`);
}

function terminalTaskIds(tasks: ProjectTaskPlan[]) {
  const referenced = new Set(tasks.flatMap((task) => task.dependsOn));
  return tasks.filter((task) => !referenced.has(task.id)).map((task) => task.id);
}

function dependenciesForRoles(tasks: ProjectTaskPlan[], roles: ExecutableAgentRole[]) {
  const roleTaskIds = tasks.filter((task) => roles.includes(task.role)).map((task) => task.id);
  return roleTaskIds.length > 0 ? roleTaskIds : terminalTaskIds(tasks);
}

const definitions: SpecialistDefinition[] = [
  {
    role: "database",
    prefix: "DB",
    slug: "database-integrity",
    title: "데이터 모델 및 저장 계층 검증",
    summary: "Database Agent가 실제 구현을 기준으로 스키마, 마이그레이션, 쿼리, 트랜잭션, 인덱스와 데이터 무결성을 검토하고 필요한 저장 계층 변경을 별도 branch/PR로 구현합니다. 근거 없는 성능 수치는 만들지 않고 재현 가능한 테스트와 migration evidence를 남깁니다.",
    acceptanceCriteria: [
      "실제 도메인 요구사항과 데이터 모델, 제약조건, 관계가 일치한다.",
      "스키마 변경이 있다면 재현 가능한 migration 또는 동등한 버전 관리 경로가 존재한다.",
      "핵심 읽기/쓰기 경로의 트랜잭션 경계, 무결성, 오류 처리가 검증된다.",
      "쿼리 또는 저장 계층 변경에 가능한 자동 테스트나 실행 evidence가 남는다.",
    ],
    shouldActivate: (plan, text) => hasAnyRole(plan, ["backend"])
      || includesAny(text, ["database", " db ", "sql", "postgres", "mysql", "sqlite", "schema", "migration", "persistence", "storage"]),
    dependencyRoles: ["backend"],
  },
  {
    role: "security",
    prefix: "SEC",
    slug: "security-hardening",
    title: "보안 경계 및 위협 표면 검증",
    summary: "Security Agent가 인증·인가, 입력 검증, 민감정보, secret, 의존성, 권한 경계와 주요 공격 표면을 실제 코드와 설정에서 독립 검증하고 필요한 보안 수정을 별도 branch/PR로 구현합니다. 다른 Agent의 보안 주장을 그대로 신뢰하지 않고 evidence를 직접 확인합니다.",
    acceptanceCriteria: [
      "인증·인가가 필요한 경로의 권한 경계와 실패 동작이 실제 코드에서 검증된다.",
      "외부 입력과 민감 데이터 처리 경로에서 검증·노출·보존 위험을 확인한다.",
      "secret 값이 repository, 로그, 사용자 응답에 하드코딩되지 않는다.",
      "발견한 위험과 수정 사항에 재현 가능한 테스트 또는 명확한 검증 evidence를 남긴다.",
    ],
    shouldActivate: (plan, text) => plan.needsAuth
      || includesAny(text, ["auth", "login", "permission", "security", "secret", "token", "payment", "admin", "sensitive"]),
    dependencyRoles: ["frontend", "backend", "database"],
  },
  {
    role: "accessibility",
    prefix: "A11Y",
    slug: "accessibility-validation",
    title: "접근성 사용자 흐름 검증",
    summary: "Accessibility Agent가 실제 사용자 화면을 기준으로 시맨틱 구조, 키보드·포커스, 스크린리더 이름, 폼/오류 전달과 주요 접근성 흐름을 독립 검증하고 필요한 수정을 별도 branch/PR로 구현합니다. 시각적 추정만으로 통과시키지 않고 가능한 자동·수동 evidence를 남깁니다.",
    acceptanceCriteria: [
      "핵심 사용자 흐름이 키보드만으로 진행 가능하고 포커스 이동이 예측 가능하다.",
      "상호작용 요소에 적절한 시맨틱 요소와 접근 가능한 이름이 제공된다.",
      "폼 상태, 오류, 로딩 등 중요한 상태가 시각 정보에만 의존하지 않는다.",
      "가능한 접근성 검사 또는 재현 가능한 수동 검증 결과가 evidence로 남는다.",
    ],
    shouldActivate: (plan, text) => hasAnyRole(plan, ["design-system", "designer", "frontend"])
      || includesAny(text, ["accessibility", "accessible", "a11y", "screen reader", "keyboard", "responsive ui"]),
    dependencyRoles: ["design-system", "designer", "frontend"],
  },
  {
    role: "devops",
    prefix: "OPS",
    slug: "delivery-runtime-readiness",
    title: "빌드·배포·운영 재현성 검증",
    summary: "DevOps Agent가 CI/CD, 환경 변수 계약, 실행·배포 설정, 컨테이너 또는 호스팅 경로, 로그와 기본 관측 가능성을 실제 repository 기준으로 검증하고 필요한 운영 변경을 별도 branch/PR로 구현합니다. 실제로 검증하지 않은 배포 성공이나 인프라 존재를 주장하지 않습니다.",
    acceptanceCriteria: [
      "깨끗한 환경에서 의존성 설치, build/test, 실행에 필요한 명령과 설정이 재현 가능하다.",
      "환경 변수와 secret 경계가 문서/설정에 명확하며 실제 secret 값은 저장소에 포함되지 않는다.",
      "CI 또는 동등한 자동 검증 경로가 현재 프로젝트의 핵심 build/test를 실행한다.",
      "배포 또는 운영 경로에서 확인하지 못한 항목은 성공으로 표시하지 않고 blocker/evidence를 남긴다.",
    ],
    shouldActivate: (plan, text) => hasAnyRole(plan, ["frontend", "backend"])
      || includesAny(text, ["deploy", "deployment", "ci/cd", "docker", "container", "infrastructure", "production", "runtime", "hosting"]),
    dependencyRoles: ["frontend", "backend", "database", "security"],
  },
];

export function ensureSpecialistAgentPlan(plan: ProjectPlan): ProjectPlan {
  const existingSpecialists = new Set(
    plan.tasks
      .filter((task) => SPECIALIST_AGENT_ROLES.includes(task.role as SpecialistRole))
      .map((task) => task.role as SpecialistRole),
  );
  const text = normalizedPlanText(plan);
  const tasks = [...plan.tasks];
  let remainingSlots = Math.max(0, MAX_TASKS_BEFORE_MANDATORY_MARKETING - tasks.length);

  for (const definition of definitions) {
    if (remainingSlots === 0) break;
    if (existingSpecialists.has(definition.role) || !definition.shouldActivate(plan, text)) continue;

    const task: ProjectTaskPlan = {
      id: nextTaskId(tasks, definition.prefix),
      title: definition.title,
      role: definition.role,
      taskSlug: nextTaskSlug(tasks, definition.slug),
      summary: definition.summary,
      dependsOn: dependenciesForRoles(tasks, definition.dependencyRoles),
      acceptanceCriteria: definition.acceptanceCriteria,
    };
    tasks.push(task);
    existingSpecialists.add(definition.role);
    remainingSlots -= 1;
  }

  return tasks.length === plan.tasks.length ? plan : { ...plan, tasks };
}
