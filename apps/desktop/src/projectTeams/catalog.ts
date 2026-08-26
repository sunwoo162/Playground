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
  version: "1.2.0",
  summary: "모든 Agent는 이설 작업 방식처럼 실제 저장소를 기준으로 독립적으로 작업합니다.",
  rules: [
    "작업 전 현재 저장소, 브랜치, 관련 규칙과 실제 파일을 확인합니다.",
    "Agent별 branch 또는 worktree에서 실제 파일을 수정합니다.",
    "필요한 라이브러리나 프레임워크는 제품 이유가 명확하면 직접 추가하고 선택 근거를 기록합니다.",
    "가능한 lint, typecheck, test, build, 실행 검증을 실제 명령으로 수행합니다.",
    "검증하지 못한 항목은 성공했다고 기록하지 않고 정확한 blocker를 남깁니다.",
    "커밋은 작은 작업 단위로 나누고 영어 커밋 메시지를 사용합니다.",
    "작업한 Agent가 직접 branch push와 PR 생성/업데이트를 수행합니다.",
    "Code Review Agent가 코드 품질을 독립 검토하고 Reviewer Agent가 기능/요구사항/구조를 별도로 검토합니다.",
    "Developer 결과는 Code Review, Reviewer, QA를 통과해야 완료로 인정합니다.",
    "문제가 생기면 Debug / Problem Router가 해결 가능한 Agent로 다시 보냅니다.",
    "프로젝트 종료 후 모든 Agent는 개별 회고를 남기고 버전 개선 후보를 만듭니다.",
  ],
};

export const WORKFLOW_STAGES = [
  "Idea",
  "Planning",
  "Design System",
  "Designer",
  "Frontend / Backend",
  "Code Review",
  "Reviewer",
  "QA",
  "User A / User B",
  "Process Evaluator",
  "Retrospective",
  "Team Evolution",
] as const;

const agentCatalog: Array<{
  role: AgentRole;
  label: string;
  description: string;
}> = [
  { role: "idea", label: "Idea Agent", description: "문제 정의와 기능 아이디어를 정리" },
  { role: "pm", label: "PM Agent", description: "요구사항, Task, Agent 실행 순서를 관리" },
  { role: "design-system", label: "Design System Agent", description: "Figma와 실제 제품 근거로 디자인 규칙을 결정" },
  { role: "designer", label: "Designer Agent", description: "제품 화면과 상호작용을 설계" },
  { role: "frontend", label: "Frontend Agent", description: "실제 프론트엔드 저장소를 구현" },
  { role: "backend", label: "Backend Agent", description: "API, DB, 서버 영역을 구현" },
  { role: "code-review", label: "Code Review Agent", description: "PR diff의 코드 품질, 버그, 보안, 성능, 테스트 누락을 독립 검토" },
  { role: "reviewer", label: "Reviewer Agent", description: "기능, 요구사항, 구조와 제품 완성도를 독립 검토" },
  { role: "qa", label: "QA Agent", description: "build, test, 실제 동작을 검증" },
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
  return agentCatalog.map((agent) => {
    const identity = createAgentRuntimeIdentity(`${teamId}:${agent.role}`, agent.role);

    return {
      id: identity.agentId,
      ...agent,
      version: "1.0.0",
      status: "idle",
      retrospectiveCount: 0,
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
    evolutionAgentVersion: "1.0.0",
  };
}
