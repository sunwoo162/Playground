import type { ProjectPlan, ProjectTaskPlan } from "./types";

export const BOUQUET_AUTH_STANDARD = {
  id: "bouquet" as const,
  name: "꽃다발",
  version: "1.0.0",
  sessionStates: [
    "checking",
    "anonymous",
    "submitting",
    "authenticated",
    "error",
  ] as const,
  routeContract: {
    session: "/auth/session",
    signIn: "/auth/sign-in",
    signUp: "/auth/sign-up",
    callback: "/auth/callback",
    signOut: "/auth/sign-out",
  },
  summary:
    "인증 공급자와 프레임워크가 달라도 서버 소유 세션, 공통 인증 상태, 보호 경로, 오류/재시도, 로그아웃과 보안 경계를 동일하게 유지하는 Luna 공용 인증 계약입니다.",
  securityRules: [
    "Access/refresh token 또는 provider secret을 localStorage/sessionStorage 같은 브라우저 영속 저장소에 보관하지 않습니다.",
    "브라우저 세션은 서버가 소유하고 production cookie는 HttpOnly, Secure, 명시적 SameSite, 최소 범위 Path/Domain 정책을 사용합니다.",
    "로그인/회원가입 성공 시 session fixation을 막기 위해 세션 식별자를 회전하고 로그아웃 시 서버 세션을 무효화합니다.",
    "returnTo/redirect 대상은 같은 origin의 허용된 로컬 경로만 사용하고 외부 URL 또는 scheme-relative URL을 거부합니다.",
    "인증 실패 메시지는 계정 존재 여부, provider token, 내부 stack/secret을 노출하지 않는 안정적인 오류 코드로 정규화합니다.",
    "서버 secret과 provider credential은 환경변수/secret store에만 두고 repository, client bundle, 로그, 문서에 실제 값을 기록하지 않습니다.",
    "보호 API는 인증되지 않은 요청에 일관된 401/403 계약을 사용하고 UI는 초기 session 확인이 끝나기 전에 보호 화면을 노출하지 않습니다.",
  ],
};

const SERVER_SLUG = "bouquet-auth-server";
const CLIENT_SLUG = "bouquet-auth-client";
const SERVER_ACCEPTANCE_CRITERIA = [
  "인증 provider 선택 근거와 provider adapter 경계가 명확하며 provider-specific 응답이 제품 전역으로 누출되지 않는다.",
  "session 조회, 로그인, 회원가입, callback, 로그아웃과 보호 API의 authenticated/anonymous/error 계약이 실제 서버에 구현된다.",
  "브라우저에 provider access/refresh token 또는 auth secret을 영속 저장하지 않고 server-owned session을 사용한다.",
  "production session cookie가 HttpOnly/Secure/명시적 SameSite와 필요한 최소 Path/Domain 범위를 사용하며 로그인 시 session identifier를 회전한다.",
  "returnTo/redirect 입력은 같은 origin의 허용된 로컬 경로만 통과하고 absolute/external/scheme-relative redirect를 거부한다.",
  "logout이 서버 세션을 실제로 무효화하고 만료/변조/누락 credential 요청은 안정적인 401/403 또는 명시적 auth error로 처리된다.",
  "provider/session secret은 환경변수 또는 secret store로만 주입되고 repository, client bundle, 로그, 문서에 실제 값이 남지 않는다.",
  "정상 로그인, 익명 session, 로그아웃, 만료/변조 session, 잘못된 callback/redirect에 대한 자동화 검증 또는 재현 가능한 서버 검증을 수행한다.",
] as const;
const CLIENT_ACCEPTANCE_CRITERIA = [
  `클라이언트 인증 상태가 ${BOUQUET_AUTH_STANDARD.sessionStates.join(", ")}를 구분하고 초기 checking 중 보호 콘텐츠가 잠깐 노출되는 auth flash가 없다.`,
  "로그인/회원가입/로그아웃 동작이 서버 session 계약과 연결되고 성공 후 session을 서버에서 다시 확인한다.",
  "보호 화면과 요청이 anonymous/401 상태에서 명확한 재인증 경로를 제공하고 무한 redirect/retry loop를 만들지 않는다.",
  "오류 상태에 사용자 재시도 경로가 있으며 계정 존재 여부, provider 내부 오류, token/secret 값을 UI에 노출하지 않는다.",
  "access/refresh token이나 provider secret을 localStorage/sessionStorage/URL query에 저장하지 않는다.",
  "로그인·회원가입 폼/버튼/오류 피드백은 키보드 사용, focus 이동, label과 적절한 접근성 상태를 지원한다.",
  "익명→로그인→보호 화면→로그아웃과 session 만료/401 재동기화 흐름을 실제 브라우저 또는 동등한 사용자 흐름 테스트로 검증한다.",
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
      choice: `${BOUQUET_AUTH_STANDARD.name} shared auth standard v${BOUQUET_AUTH_STANDARD.version}`,
      reason:
        "프로젝트별 인증 흐름 재구현을 피하고 세션, 보호 경로, 오류 상태, redirect 검증과 secret 경계를 조직 공통 계약으로 유지하기 위해 사용합니다.",
    },
  ];
}

function createServerTask(tasks: ProjectTaskPlan[]): ProjectTaskPlan {
  return {
    id: nextTaskId(tasks, "AUTH"),
    title: "꽃다발 서버 인증 계약 구현",
    role: "backend",
    taskSlug: nextTaskSlug(tasks, SERVER_SLUG),
    summary: `${BOUQUET_AUTH_STANDARD.name} v${BOUQUET_AUTH_STANDARD.version} 서버 계약을 실제 프로젝트 기술 스택에 구현합니다. Provider adapter와 관계없이 session 조회, 로그인/회원가입 시작 및 callback, 로그아웃, 보호 API 인증 경계를 일관되게 제공하고 server-owned session과 redirect/secret 보안 규칙을 지킵니다. 공통 route 의미는 ${Object.values(BOUQUET_AUTH_STANDARD.routeContract).join(", ")}이며 framework routing 규칙 때문에 실제 URL이 달라지면 문서에 대응 관계를 명시합니다.`,
    dependsOn: [],
    acceptanceCriteria: [...SERVER_ACCEPTANCE_CRITERIA],
  };
}

function createClientTask(tasks: ProjectTaskPlan[], serverTaskId: string): ProjectTaskPlan {
  return {
    id: nextTaskId(tasks, "AUTHUI"),
    title: "꽃다발 클라이언트 인증 흐름 구현",
    role: "frontend",
    taskSlug: nextTaskSlug(tasks, CLIENT_SLUG),
    summary: `${BOUQUET_AUTH_STANDARD.name} 공통 session state(${BOUQUET_AUTH_STANDARD.sessionStates.join(", ")})를 실제 UI에 연결합니다. 로그인/회원가입/로그아웃, 보호 경로, 401 재동기화, 오류와 재시도 상태를 제품 디자인에 맞게 표현하되 인증 단계와 상태 의미는 공통 계약을 유지합니다.`,
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
    throw new Error("꽃다발 Backend 인증 Task에 공통 server/session/security acceptance criteria가 누락되었습니다.");
  }
  if (missingCriteria(client, CLIENT_ACCEPTANCE_CRITERIA).length > 0) {
    throw new Error("꽃다발 Frontend 인증 Task에 공통 session/UI/security acceptance criteria가 누락되었습니다.");
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
