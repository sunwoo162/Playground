import type { ProjectPlan, ProjectTaskPlan } from "./types";

export const BOUQUET_AUTH_STANDARD = {
  id: "bouquet" as const,
  name: "꽃다발",
  version: "2.0.0",
  sessionStates: [
    "checking",
    "anonymous",
    "redirecting",
    "callback",
    "authenticated",
    "error",
  ] as const,
  routeContract: {
    authPortal: "/bloom/?mode=auth",
    authorize: "/api/bouquet/oauth/authorize",
    token: "/api/bouquet/oauth/token",
    userInfo: "/api/bouquet/oauth/userinfo",
    callback: "/auth/bouquet/callback",
    session: "/auth/session",
    signOut: "/auth/sign-out",
  },
  summary:
    "모든 Luna 프로젝트가 자체 회원가입 시스템을 만들지 않고 BloomBouquet의 중앙 꽃다발 계정을 Authorization Code + PKCE(S256)로 공유하는 공용 SSO 계약입니다.",
  securityRules: [
    "프로젝트는 꽃다발 이메일/비밀번호를 직접 수집하거나 저장하지 않고 중앙 꽃다발 인증 Portal로 이동합니다.",
    "프로젝트 Backend/BFF가 OAuth state와 PKCE verifier를 생성하고 callback까지 짧게 보관하며 verifier를 localStorage/sessionStorage 또는 URL에 저장하지 않습니다.",
    "callback은 state를 검증한 뒤 authorization code를 서버에서 1회 교환하고 bouquet access token으로 userinfo를 조회하며 이 token을 브라우저에 노출하지 않습니다.",
    "꽃다발 access token 또는 authorization code를 repository, 브라우저 영속 저장소, analytics, 오류 화면, application log에 기록하지 않습니다.",
    "userinfo 확인 후 프로젝트는 자신의 server-owned session을 만들고 production cookie는 HttpOnly, Secure, 명시적 SameSite와 최소 Path/Domain 정책을 사용합니다.",
    "등록된 redirect URI와 실제 callback URI는 정확히 일치해야 하고 returnTo/redirect 대상은 프로젝트 내부 허용 경로만 사용합니다.",
    "프로젝트 logout은 프로젝트 세션을 무효화하며 중앙 꽃다발 SSO 세션을 임의로 제거하지 않습니다.",
    "인증 실패 메시지는 계정 존재 여부, authorization code, access token, 내부 stack/secret을 노출하지 않는 안정적인 오류 코드로 정규화합니다.",
    "Bouquet issuer/base URL과 client ID는 환경설정으로 주입하고 실제 secret은 repository/client bundle에 기록하지 않습니다.",
    "보호 API는 인증되지 않은 요청에 일관된 401/403 계약을 사용하고 UI는 초기 project session 확인이 끝나기 전에 보호 화면을 노출하지 않습니다.",
  ],
};

const SERVER_SLUG = "bouquet-auth-server";
const CLIENT_SLUG = "bouquet-auth-client";
const SERVER_ACCEPTANCE_CRITERIA = [
  "프로젝트가 자체 꽃다발 회원가입/비밀번호 저장소를 구현하지 않고 중앙 BloomBouquet auth Portal을 유일한 꽃다발 credential 입력 지점으로 사용한다.",
  "Backend/BFF가 OAuth state와 RFC 7636 PKCE S256 verifier/challenge를 생성하고 callback 전까지 서버 세션 또는 보호된 단기 저장소에 보관한다.",
  "로그인 시작 시 중앙 꽃다발 auth Portal로 client_id, 정확한 redirect_uri, state, code_challenge, code_challenge_method=S256만 전달한다.",
  "callback은 state를 constant-time 또는 동등하게 안전한 방식으로 검증하고 불일치/누락/재사용 요청을 거부한다.",
  "authorization code 교환과 /userinfo 호출은 Backend/BFF에서 수행하며 bouquet access token, code, verifier가 브라우저 localStorage/sessionStorage 또는 client bundle에 남지 않는다.",
  "userinfo 성공 뒤 프로젝트 고유 server-owned session을 발급하고 production cookie가 HttpOnly/Secure/명시적 SameSite와 필요한 최소 Path/Domain 범위를 사용한다.",
  "등록된 꽃다발 redirect URI와 callback URI를 정확히 유지하고 로그인 이후 returnTo/redirect 값은 프로젝트 내부 허용 경로만 통과시킨다.",
  "logout이 프로젝트 세션을 실제로 무효화하되 중앙 꽃다발 SSO 세션을 자동 삭제하지 않으며 만료/변조/누락 credential은 안정적인 401/403 또는 auth error로 처리한다.",
  "Bouquet base URL/client ID는 환경설정으로 주입하고 token/code/verifier/secret은 repository, client bundle, 로그, 문서에 실제 값을 남기지 않는다.",
  "로그인 시작, callback 성공, state 불일치, 잘못된 PKCE, code 재사용, 익명 session, logout, 만료 session에 대한 자동화 검증 또는 재현 가능한 서버 검증을 수행한다.",
] as const;
const CLIENT_ACCEPTANCE_CRITERIA = [
  `클라이언트 인증 상태가 ${BOUQUET_AUTH_STANDARD.sessionStates.join(", ")}를 구분하고 초기 checking 중 보호 콘텐츠가 잠깐 노출되는 auth flash가 없다.`,
  "로그인 버튼은 프로젝트가 꽃다발 이메일/비밀번호를 직접 받지 않고 서버의 꽃다발 로그인 시작 endpoint를 통해 중앙 auth Portal로 이동한다.",
  "callback 처리 중 중복 제출/새로고침을 안전하게 처리하고 완료 뒤 프로젝트 session을 서버에서 다시 확인한 후 보호 화면으로 전환한다.",
  "보호 화면과 요청이 anonymous/401 상태에서 명확한 재인증 경로를 제공하고 무한 redirect/retry loop를 만들지 않는다.",
  "오류 상태에 사용자 재시도 경로가 있으며 계정 존재 여부, code/verifier/token 또는 중앙 provider 내부 오류를 UI에 노출하지 않는다.",
  "꽃다발 access token, authorization code, PKCE verifier를 localStorage/sessionStorage에 보관하거나 URL에 장기간 남기지 않는다.",
  "로그인/로그아웃 버튼, callback/error 피드백은 키보드 사용, focus 이동, label과 적절한 접근성 상태를 지원한다.",
  "익명→꽃다발 Portal→callback→보호 화면→프로젝트 로그아웃과 session 만료/401 재동기화 흐름을 실제 브라우저 또는 동등한 사용자 흐름 테스트로 검증한다.",
] as const;

function nextTaskId(tasks: ProjectTaskPlan[], prefix: string) {
  const used = new Set(tasks.map((task) => task.id));
  for (let index = 1; index <= 999; index += 1) {
    const candidate = `${prefix}-${String(index).padStart(3, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`${prefix} Task ID를 생성할 수 없습니다.`);
}

function nextTaskSlug(tasks: ProjectTaskPlan[], base: string) {
  const used = new Set(tasks.map((task) => task.taskSlug));
  if (!used.has(base)) return base;
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`${base} taskSlug를 생성할 수 없습니다.`);
}

function isServerTask(task: ProjectTaskPlan) {
  return task.role === "backend" && task.taskSlug.startsWith(SERVER_SLUG);
}

function isClientTask(task: ProjectTaskPlan) {
  return task.role === "frontend" && task.taskSlug.startsWith(CLIENT_SLUG);
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function mergeRequiredCriteria(
  task: ProjectTaskPlan,
  required: readonly string[],
): ProjectTaskPlan {
  return {
    ...task,
    acceptanceCriteria: unique([...task.acceptanceCriteria, ...required]),
  };
}

function authTechnologyDecision(plan: ProjectPlan) {
  const alreadyDeclared = plan.technologyDecisions.some((decision) =>
    decision.area.trim().toLowerCase() === "authentication"
      && decision.choice.includes(BOUQUET_AUTH_STANDARD.name),
  );
  if (alreadyDeclared) return plan.technologyDecisions;

  return [
    ...plan.technologyDecisions,
    {
      area: "authentication",
      choice: `${BOUQUET_AUTH_STANDARD.name} shared SSO v${BOUQUET_AUTH_STANDARD.version} (Authorization Code + PKCE S256)`,
      reason:
        "프로젝트별 계정/비밀번호 시스템을 제거하고 BloomBouquet 중앙 계정을 공유하되 각 프로젝트의 세션과 권한 경계는 독립적으로 유지하기 위해 사용합니다.",
    },
  ];
}

function createServerTask(tasks: ProjectTaskPlan[]): ProjectTaskPlan {
  return {
    id: nextTaskId(tasks, "AUTH"),
    title: "꽃다발 SSO 서버 클라이언트 연동",
    role: "backend",
    taskSlug: nextTaskSlug(tasks, SERVER_SLUG),
    summary: `${BOUQUET_AUTH_STANDARD.name} v${BOUQUET_AUTH_STANDARD.version} 중앙 SSO를 프로젝트 Backend/BFF에 연결합니다. 자체 회원가입/비밀번호 저장소를 만들지 않고 state + PKCE S256 로그인 시작, ${BOUQUET_AUTH_STANDARD.routeContract.callback} callback의 서버측 code 교환과 userinfo 확인, 프로젝트 고유 HttpOnly session, logout/401 경계를 구현합니다. Bouquet base URL/client ID/redirect URI는 배포 환경설정으로 주입합니다.`,
    dependsOn: [],
    acceptanceCriteria: [...SERVER_ACCEPTANCE_CRITERIA],
  };
}

function createClientTask(tasks: ProjectTaskPlan[], serverTaskId: string): ProjectTaskPlan {
  return {
    id: nextTaskId(tasks, "AUTHUI"),
    title: "꽃다발 SSO 클라이언트 흐름 구현",
    role: "frontend",
    taskSlug: nextTaskSlug(tasks, CLIENT_SLUG),
    summary: `${BOUQUET_AUTH_STANDARD.name} 공통 project session state(${BOUQUET_AUTH_STANDARD.sessionStates.join(", ")})를 UI에 연결합니다. credential form은 만들지 않고 로그인 시 프로젝트 Backend/BFF를 통해 중앙 꽃다발 Portal로 이동하며 callback 처리, 보호 경로, 401 재동기화, 오류/재시도, 프로젝트 로그아웃을 제품 디자인에 맞게 구현합니다.`,
    dependsOn: [serverTaskId],
    acceptanceCriteria: [...CLIENT_ACCEPTANCE_CRITERIA],
  };
}

function missingCriteria(task: ProjectTaskPlan, required: readonly string[]) {
  return required.filter((criterion) => !task.acceptanceCriteria.includes(criterion));
}

export function validateBouquetAuthPlan(plan: ProjectPlan) {
  if (!plan.needsAuth) return;

  const serverTasks = plan.tasks.filter(isServerTask);
  const clientTasks = plan.tasks.filter(isClientTask);
  if (serverTasks.length !== 1 || clientTasks.length !== 1) {
    throw new Error(
      `꽃다발 인증 계획에는 표준 Backend Task와 Frontend Task가 각각 1개 필요합니다. server=${serverTasks.length}, client=${clientTasks.length}`,
    );
  }

  const server = serverTasks[0];
  const client = clientTasks[0];
  if (!client.dependsOn.includes(server.id)) {
    throw new Error("꽃다발 Frontend 인증 Task는 Backend 인증 계약 Task에 직접 의존해야 합니다.");
  }
  if (missingCriteria(server, SERVER_ACCEPTANCE_CRITERIA).length > 0) {
    throw new Error("꽃다발 Backend 인증 Task에 중앙 SSO/PKCE/session/security acceptance criteria가 누락되었습니다.");
  }
  if (missingCriteria(client, CLIENT_ACCEPTANCE_CRITERIA).length > 0) {
    throw new Error("꽃다발 Frontend 인증 Task에 중앙 SSO/session/UI/security acceptance criteria가 누락되었습니다.");
  }

  const hasDecision = plan.technologyDecisions.some((decision) =>
    decision.area.trim().toLowerCase() === "authentication"
      && decision.choice.includes(BOUQUET_AUTH_STANDARD.name),
  );
  if (!hasDecision) {
    throw new Error("needsAuth 프로젝트의 technologyDecisions에 꽃다발 authentication 표준이 기록되어야 합니다.");
  }
}

export function ensureBouquetAuthPlan(plan: ProjectPlan): ProjectPlan {
  if (!plan.needsAuth) return plan;

  let tasks = [...plan.tasks];
  let server = tasks.find(isServerTask);
  if (!server) {
    server = createServerTask(tasks);
    tasks.push(server);
  } else {
    server = mergeRequiredCriteria(server, SERVER_ACCEPTANCE_CRITERIA);
    const serverId = server.id;
    tasks = tasks.map((task) => task.id === serverId ? server! : task);
  }

  let client = tasks.find(isClientTask);
  if (!client) {
    client = createClientTask(tasks, server.id);
    tasks.push(client);
  } else {
    client = {
      ...mergeRequiredCriteria(client, CLIENT_ACCEPTANCE_CRITERIA),
      dependsOn: unique([...client.dependsOn, server.id]),
    };
    const clientId = client.id;
    tasks = tasks.map((task) => task.id === clientId ? client! : task);
  }

  const nextPlan: ProjectPlan = {
    ...plan,
    technologyDecisions: authTechnologyDecision(plan),
    tasks,
  };
  validateBouquetAuthPlan(nextPlan);
  return nextPlan;
}
