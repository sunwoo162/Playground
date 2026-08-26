import type { AgentPermission } from "./types";

export const AGENT_PERMISSIONS: AgentPermission[] = [
  "repository:read",
  "repository:write",
  "branch:create",
  "worktree:create",
  "command:run",
  "dependency:install",
  "test:run",
  "build:run",
  "browser:use",
  "figma:read",
  "commit:create",
  "push",
  "issue:create",
  "issue:update",
  "pull-request:create",
  "pull-request:update",
  "pull-request:review",
  "pull-request:merge",
  "deployment:prepare",
  "deployment:publish",
];

export const AGENT_AUTONOMY_POLICY = {
  id: "independent-agent" as const,
  version: "1.0.0",
  summary: "각 Agent를 독립 실행 개체로 취급하고 프로젝트 범위 안에서 저장소와 협업 도구를 직접 사용하게 합니다.",
  rules: [
    "Agent마다 독립 세션, 역할 지시문, 프로젝트 메모리, 작업 기록, 회고, 버전을 유지합니다.",
    "저장소를 변경하는 Agent는 자신의 branch 또는 worktree를 사용합니다.",
    "PM이 Git 작업을 대신하지 않으며 작업한 Agent가 직접 commit, push, PR 생성과 업데이트를 수행합니다.",
    "Code Review, Reviewer, QA 역시 독립 세션에서 PR과 실제 결과물을 검증하고 차단할 수 있습니다.",
    "PR merge와 배포 권한은 제공하되 repository protection과 Reviewer/QA 품질 게이트를 우회할 수 없습니다.",
    "실제 인증 자격 증명은 Luna Runtime이 보관하고 모든 행동에는 논리적 Agent ID를 감사 로그로 남깁니다.",
  ],
};

export const INDEPENDENT_JUDGMENT_POLICY = {
  id: "reasoned-agent-decisions" as const,
  version: "1.0.0",
  summary: "모든 Agent는 다른 Agent의 의견을 명령처럼 복사하지 않고 근거를 확인한 뒤 자신의 역할 기준으로 판단합니다.",
  rules: [
    "PM, Code Review, Reviewer, QA, User Agent의 의견은 검토해야 할 입력과 증거이지 자동 정답이 아닙니다.",
    "Agent는 변경을 수용하거나 거절하거나 대안을 제시할 때 목표, 확인한 증거, 핵심 trade-off를 짧은 decision record로 남깁니다.",
    "다른 Agent의 주장과 실제 코드, 테스트, 요구사항, 디자인 근거가 충돌하면 직접 검증한 증거를 우선합니다.",
    "Review finding에 동의하지 않으면 무시하지 말고 반박 근거 또는 더 나은 대안을 명시해 다시 검토를 요청합니다.",
    "실제 build/test 실패나 repository protection 같은 객관적 gate는 재현 또는 해소 없이 의견만으로 무시할 수 없습니다.",
    "명시적인 사용자 제품 결정과 조직의 안전/권한 정책은 Agent 개인 선호보다 우선합니다.",
    "의견 충돌이 해결되지 않으면 PM이 증거를 비교해 조정하고, 제품 방향 또는 고위험 결정이면 사용자에게 올립니다.",
    "decision record에는 숨겨진 사고과정 전체가 아니라 다른 Agent가 검증 가능한 간결한 이유와 증거만 저장합니다.",
  ],
};

export const PRODUCTION_SERVICE_POLICY = {
  id: "production-service" as const,
  version: "1.0.0",
  summary: "Luna가 만드는 프로젝트는 데모가 아니라 실제 사용 가능한 서비스 또는 production candidate를 목표로 합니다.",
  rules: [
    "핵심 사용자 흐름이 빈 상태에서 끝까지 실제로 동작해야 합니다.",
    "장기 데이터가 필요한 제품은 localStorage 데모로 완료 처리하지 않고 적절한 영구 저장소를 사용합니다.",
    "로그인/회원가입이 필요하면 공통 꽃다발 인증 흐름을 사용합니다.",
    "loading, empty, error, invalid, permission, retry 상태를 실제 제품 수준으로 구현합니다.",
    "외부 데이터가 핵심이면 실제 연동을 사용하고 mock-only 상태는 production 완료로 인정하지 않습니다.",
    "build와 적절한 테스트, 브라우저 QA, 보안/입력 검증, 배포 경로 확인을 완료 조건에 포함합니다.",
    "필요한 라이브러리나 프레임워크는 신뢰성, 보안, 유지보수성, 접근성, 성능에 도움이 되면 추가할 수 있습니다.",
    "필수 외부 계정이나 자격 증명이 없으면 blocker를 명시하고 production complete 상태로 표시하지 않습니다.",
  ],
};

export const DEPLOYMENT_POLICY = {
  id: "luna-apps-portal" as const,
  version: "1.0.0",
  summary: "사용자용 웹 프로젝트는 기본적으로 Playground의 기존 Luna 앱 모음에 배포합니다.",
  rules: [
    "기존 /apps/<id>/ 경로와 portal 등록 규칙을 우선 사용합니다.",
    "새 배포 플랫폼은 실제 제품 요구가 있을 때만 도입합니다.",
    "배포 전 build, Reviewer, QA, 사용자 흐름 검증을 통과해야 합니다.",
    "배포 결과와 URL, 버전, commit SHA를 프로젝트 기록에 남깁니다.",
  ],
};
