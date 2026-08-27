import { createAgentRuntimeIdentity } from "./permissions";
import type { AgentRole, AgentState, ProjectTeamsState, TeamId, TeamState } from "./types";

export const BOUQUET_AUTH_POLICY = {
  id: "bouquet" as const,
  name: "꽃다발",
  version: "1.0.0",
  mode: "when-auth-required" as const,
  summary: "로그인 또는 회원가입이 필요한 프로젝트는 동일한 꽃다발 인증 흐름을 사용합니다.",
  rules: [
    "프로젝트마다 별도 로그인/회원가입 UX를 새로 만들지 않습니다.",
    "인증이 필요하다고 판단되면 PM이 꽃다발 정책을 요구사항과 Task에 포함합니다.",
    "브랜드 차이는 겉모습에서만 허용하고 인증 단계와 상태 정의는 공통 규칙을 유지합니다.",
  ],
};

export const EXECUTION_POLICY = {
  id: "iseol-workflow" as const,
  version: "1.6.0",
  summary: "모든 Agent는 이설 작업 방식처럼 실제 저장소를 기준으로 독립적으로 작업하며 10년 이상 시니어 수준의 품질 기준을 적용합니다.",
  rules: [
    "모든 Agent는 자신의 전문 역할에서 최소 10년 이상 실무를 수행한 시니어 수준의 판단, 품질 기준, 리스크 감각을 적용합니다.",
    "작업 전 현재 저장소, 브랜치, 관련 규칙과 실제 파일을 확인합니다.",
    "Agent별 branch 또는 worktree에서 실제 파일을 수정합니다.",
    "필요한 라이브러리나 프레임워크는 제품 이유가 명확하면 직접 추가하고 선택 근거를 기록합니다.",
    "가능한 lint, typecheck, test, build, 실행 검증을 실제 명령으로 수행합니다.",
    "검증하지 못한 항목은 성공했다고 기록하지 않고 정확한 blocker를 남깁니다.",
    "커밋은 작은 작업 단위로 나누고 영어 커밋 메시지를 사용합니다.",
    "작업한 Agent가 직접 branch push와 PR 생성/업데이트를 수행합니다.",
    "Database Agent는 schema, migration, query, persistence 경계를 독립적으로 맡고 데이터 무결성과 롤백 가능성을 검토합니다.",
    "Security Agent는 인증, 권한, secret, 입력 경계와 주요 공격 표면을 독립적으로 맡고 보안 근거를 남깁니다.",
    "DevOps Agent는 CI/CD, container, deployment, observability와 운영 복구 경로를 독립적으로 맡습니다.",
    "Accessibility Agent는 keyboard, semantic structure, ARIA, focus, contrast와 assistive technology 사용 흐름을 독립 검증합니다.",
    "Performance Agent는 latency, throughput, rendering, bundle, query, memory, cache와 부하 병목을 근거 기반으로 분석하고 개선합니다.",
    "API Integration Agent는 외부 API, SDK, webhook, contract, retry, timeout과 장애 격리 경계를 독립적으로 구현·검증합니다.",
    "Test Automation Agent는 반복 가능한 E2E, integration, contract regression test와 자동 검증 흐름을 구현합니다.",
    "UX Research Agent는 사용자 문제, usability evidence, journey와 상호작용 가설을 검증해 설계 판단 근거를 보강합니다.",
    "Frontend, Backend, Code Review, QA, Documentation은 작업량이 큰 프로젝트에서 복수 Agent capacity를 사용할 수 있도록 팀 내부에 여러 독립 identity를 둡니다.",
    "Code Review Agent가 코드 품질을 독립 검토하고 Reviewer Agent가 기능/요구사항/구조를 별도로 검토합니다.",
    "QA Agent는 실제 build/test/사용 흐름을 검증하고 Documentation Agent는 검증된 사실을 기준으로 사용자·개발·운영·마케팅 문서를 맞춥니다.",
    "Data & Marketing Agent는 제품, 사용자, 채널, 퍼널, 지표, SEO/콘텐츠, 출시 실험을 근거 중심으로 분석하고 Documentation Agent가 검증·정리할 수 있는 마케팅 산출물을 남깁니다.",
    "Developer 결과는 Code Review, Reviewer, QA를 통과해야 완료로 인정합니다.",
    "문제가 생기면 Debug / Problem Router가 해결 가능한 Agent로 다시 보냅니다.",
    "프로젝트 종료 후 모든 Agent는 개별 회고를 남기고 버전 개선 후보를 만듭니다.",
  ],
};

export const WORKFLOW_STAGES = [
  "Idea",
  "Planning",
  "UX Research",
  "Design System",
  "Designer",
  "Frontend / Backend",
  "Database / Security / DevOps / Accessibility",
  "Performance / API Integration / Test Automation",
  "Code Review",
  "Reviewer",
  "QA",
  "Data & Marketing",
  "Documentation",
  "User A / User B",
  "Process Evaluator",
  "Retrospective",
  "Team Evolution",
] as const;

type AgentCatalogEntry = {
  role: AgentRole;
  label: string;
  description: string;
  instance?: number;
};

const agentCatalog: AgentCatalogEntry[] = [
  { role: "idea", label: "Idea Agent", description: "문제 정의와 기능 아이디어를 정리" },
  { role: "pm", label: "PM Agent", description: "요구사항, Task, Agent 실행 순서를 관리" },
  { role: "design-system", label: "Design System Agent", description: "Figma와 실제 제품 근거로 디자인 규칙을 결정" },
  { role: "designer", label: "Designer Agent", description: "제품 화면과 상호작용을 설계" },
  { role: "ux-research", label: "UX Research Agent", description: "사용자 문제, usability evidence, journey와 설계 가설을 검증" },
  { role: "frontend", label: "Frontend Agent 1", description: "실제 프론트엔드 저장소를 구현", instance: 1 },
  { role: "frontend", label: "Frontend Agent 2", description: "독립 프론트엔드 Task를 병렬 처리할 추가 구현 capacity", instance: 2 },
  { role: "frontend", label: "Frontend Agent 3", description: "독립 프론트엔드 Task를 병렬 처리할 추가 구현 capacity", instance: 3 },
  { role: "backend", label: "Backend Agent 1", description: "API와 서버 애플리케이션 영역을 구현", instance: 1 },
  { role: "backend", label: "Backend Agent 2", description: "독립 백엔드 Task를 병렬 처리할 추가 구현 capacity", instance: 2 },
  { role: "backend", label: "Backend Agent 3", description: "독립 백엔드 Task를 병렬 처리할 추가 구현 capacity", instance: 3 },
  { role: "database", label: "Database Agent", description: "데이터 모델, schema, migration, query와 persistence 무결성을 구현" },
  { role: "security", label: "Security Agent", description: "인증, 권한, secret, 입력 경계와 보안 위험을 구현·검증" },
  { role: "devops", label: "DevOps Agent", description: "CI/CD, container, deployment, observability와 운영 경로를 구현" },
  { role: "accessibility", label: "Accessibility Agent", description: "키보드, semantic UI, ARIA, focus, contrast와 접근성 흐름을 구현·검증" },
  { role: "performance", label: "Performance Agent", description: "latency, rendering, query, memory, cache와 병목을 분석하고 성능을 개선" },
  { role: "api-integration", label: "API Integration Agent", description: "외부 API, SDK, webhook, contract와 실패 격리 경계를 구현" },
  { role: "data-marketing", label: "Data & Marketing Agent", description: "제품 데이터, 사용자 세그먼트, 퍼널, 채널, SEO/콘텐츠, 출시 실험을 분석하고 마케팅 전략 문서를 작성" },
  { role: "code-review", label: "Code Review Agent 1", description: "PR diff의 코드 품질, 버그, 보안, 성능, 테스트 누락을 독립 검토", instance: 1 },
  { role: "code-review", label: "Code Review Agent 2", description: "독립 PR 묶음을 검토할 추가 review capacity", instance: 2 },
  { role: "reviewer", label: "Reviewer Agent", description: "기능, 요구사항, 구조와 제품 완성도를 독립 검토" },
  { role: "qa", label: "QA Agent 1", description: "build, test, 실제 동작을 검증", instance: 1 },
  { role: "qa", label: "QA Agent 2", description: "독립 사용자 흐름과 regression 범위를 병렬 검증할 추가 QA capacity", instance: 2 },
  { role: "test-automation", label: "Test Automation Agent", description: "E2E, integration, contract regression test와 반복 가능한 자동 검증을 구현" },
  { role: "documentation", label: "Documentation Agent 1", description: "실제 구현과 검증 결과를 근거로 사용자·개발·운영·마케팅 문서를 유지", instance: 1 },
  { role: "documentation", label: "Documentation Agent 2", description: "독립 문서 묶음을 병렬 정리할 추가 documentation capacity", instance: 2 },
  { role: "debug-router", label: "Debug / Problem Router", description: "문제 원인을 분류하고 적합한 Agent로 재배정" },
  { role: "user-a", label: "User Agent A", description: "처음 사용하는 사용자 관점으로 검증" },
  { role: "user-b", label: "User Agent B", description: "숙련 사용자 관점으로 효율과 반복 작업을 검증" },
  { role: "process-evaluator", label: "Process Evaluator", description: "결과와 프로젝트 진행 과정 전체를 평가" },
];

const teamCatalog: Array<{ id: TeamId; name: string }> = [
  { id: "rose", name: "장미" },
  { id: "lily", name: "백합" },
  { id: "tulip", name: "튤립" },
  { id: "sunflower", name: "해바라기" },
  { id: "cherry-blossom", name: "벚꽃" },
];

function createAgents(teamId: TeamId): AgentState[] {
  return agentCatalog.map(({ instance = 1, ...agent }) => {
    const suffix = instance > 1 ? `-${instance}` : "";
    const identity = createAgentRuntimeIdentity(`${teamId}:${agent.role}${suffix}`, agent.role);

    return {
      id: identity.agentId,
      ...agent,
      version: "1.0.0",
      status: "idle",
      retrospectiveCount: 0,
      seniority: "senior-10-plus",
      minimumExperienceYears: 10,
      autonomy: identity.autonomy,
      permissions: identity.permissions,
    };
  });
}

function createTeam(id: TeamId, name: string): TeamState {
  return {
    id,
    name,
    status: "idle",
    playbookVersion: "1.0.0",
    completedProjects: 0,
    averageScore: null,
    activeProjectId: null,
    agents: createAgents(id),
  };
}

export function createInitialProjectTeamsState(): ProjectTeamsState {
  return {
    schemaVersion: 1,
    teams: teamCatalog.map((team) => createTeam(team.id, team.name)),
    projects: [],
    decisions: [],
    evolutionAgentVersion: "1.0.0",
  };
}
