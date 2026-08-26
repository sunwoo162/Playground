import type { ProjectPlan, ProjectTaskPlan } from "./types";

export const PRODUCT_MARKETING_POLICY = {
  id: "data-marketing-evidence" as const,
  version: "1.1.0",
  analysisPath: "docs/marketing/MARKETING_ANALYSIS.md",
  documentPath: "docs/marketing/GO_TO_MARKET.md",
  summary: "모든 제품은 출시 전 Data & Marketing Agent가 제품 근거와 실제 데이터를 분석하고 Documentation Agent가 그 분석과 실제 release를 독립 검증해 최종 마케팅 문서를 repository에 남깁니다.",
  rules: [
    "Data & Marketing Agent는 MARKETING_ANALYSIS.md에 타깃 사용자, 핵심 문제, 가치 제안, 포지셔닝, 획득 채널, 활성화/전환/유지 퍼널을 분석합니다.",
    "Documentation Agent는 마케팅 분석 PR과 실제 제품을 대조해 최종 GO_TO_MARKET.md를 작성하고 제품 문서에서 연결합니다.",
    "SEO, 콘텐츠, 커뮤니티, 파트너십, 유료 채널은 제품 특성과 타깃 사용자에 맞을 때만 제안합니다.",
    "시장 규모, 사용자 수, CTR, 전환율, CAC, LTV 등 실제로 측정하지 않은 숫자는 만들어내지 않습니다.",
    "관찰된 사실, repository/telemetry에서 확인한 데이터, 외부 출처, 추론, 실험 가설을 명확히 구분합니다.",
    "분석 가능한 데이터가 없다면 필요한 analytics event, north-star/guardrail metric, 실험 설계와 수집 계획을 문서화합니다.",
    "개인정보나 민감정보를 마케팅 편의 때문에 과도하게 수집하지 않으며 측정 계획에 데이터 최소화와 보존 원칙을 포함합니다.",
    "경쟁/시장 자료를 사용하면 출처와 확인 날짜를 남기고 확인할 수 없는 주장을 사실처럼 쓰지 않습니다.",
    "최종 마케팅 산출물은 Code Review → Reviewer → QA 경로에서 실제 release와 다시 검증합니다.",
  ],
};

const MAX_PM_TASKS_BEFORE_MARKETING = 35;

function transitiveDependsOn(plan: ProjectPlan, taskId: string, dependencyTaskId: string) {
  const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const stack = [...(tasks.get(taskId)?.dependsOn ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === dependencyTaskId) return true;
    visited.add(current);
    stack.push(...(tasks.get(current)?.dependsOn ?? []));
  }

  return false;
}

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

function terminalTaskIds(tasks: ProjectTaskPlan[]) {
  const referenced = new Set(tasks.flatMap((task) => task.dependsOn));
  return tasks.filter((task) => !referenced.has(task.id)).map((task) => task.id);
}

export function isMandatoryMarketingTask(task: ProjectTaskPlan) {
  return task.role === "data-marketing"
    || task.taskSlug.startsWith("marketing-documentation")
    || task.taskSlug.startsWith("marketing-docs-code-review")
    || task.taskSlug.startsWith("marketing-product-review")
    || task.taskSlug.startsWith("product-marketing-strategy");
}

export function validateMarketingDocumentationPlan(plan: ProjectPlan) {
  const marketingTasks = plan.tasks.filter((task) => task.role === "data-marketing");
  if (marketingTasks.length === 0) {
    throw new Error("모든 제품 계획에는 Data & Marketing Agent Task가 필요합니다.");
  }

  const errors: string[] = [];
  for (const marketing of marketingTasks) {
    const documentation = plan.tasks.filter(
      (task) => task.role === "documentation" && transitiveDependsOn(plan, task.id, marketing.id),
    );
    if (documentation.length === 0) {
      errors.push(`${marketing.id} 이후 Documentation Agent Task가 없습니다.`);
      continue;
    }

    const codeReviews = plan.tasks.filter(
      (task) => task.role === "code-review"
        && transitiveDependsOn(plan, task.id, marketing.id)
        && documentation.some((doc) => transitiveDependsOn(plan, task.id, doc.id)),
    );
    if (codeReviews.length === 0) {
      errors.push(`${marketing.id} 마케팅 분석과 Documentation 산출물을 함께 검토하는 Code Review Task가 없습니다.`);
      continue;
    }

    const reviewers = plan.tasks.filter(
      (task) => task.role === "reviewer"
        && codeReviews.some((review) => transitiveDependsOn(plan, task.id, review.id)),
    );
    if (reviewers.length === 0) {
      errors.push(`${marketing.id} 마케팅 문서 검증 경로에 Reviewer Task가 없습니다.`);
      continue;
    }

    const qaTasks = plan.tasks.filter(
      (task) => task.role === "qa"
        && reviewers.some((reviewer) => transitiveDependsOn(plan, task.id, reviewer.id)),
    );
    if (qaTasks.length === 0) {
      errors.push(`${marketing.id} 마케팅 문서 검증 경로에 QA Task가 없습니다.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`제품 마케팅/문서화 DAG가 불완전합니다. ${errors.join(" ")}`);
  }
}

export function ensureMarketingDocumentationPlan(plan: ProjectPlan): ProjectPlan {
  if (plan.tasks.some((task) => task.role === "data-marketing")) {
    validateMarketingDocumentationPlan(plan);
    return plan;
  }

  if (plan.tasks.length > MAX_PM_TASKS_BEFORE_MARKETING) {
    throw new Error(
      `PM 계획 Task가 ${plan.tasks.length}개라 필수 마케팅/문서화 검증 Task 5개를 안전하게 추가할 수 없습니다. PM 계획을 더 작은 Task 구조로 재작성해 주세요.`,
    );
  }

  const tasks = [...plan.tasks];
  const upstream = terminalTaskIds(tasks);

  const marketingTask: ProjectTaskPlan = {
    id: nextTaskId(tasks, "MKT"),
    title: "제품 데이터 및 마케팅 분석",
    role: "data-marketing",
    taskSlug: nextTaskSlug(tasks, "product-marketing-strategy"),
    summary: `실제 제품 구현, 사용자 흐름, 검증 결과와 접근 가능한 데이터를 분석해 ${PRODUCT_MARKETING_POLICY.analysisPath}에 근거 중심의 마케팅 분석을 작성합니다. 타깃 사용자, 포지셔닝, 채널, SEO/콘텐츠, 퍼널, 핵심 지표, analytics event, 실험 backlog, 개인정보 고려사항을 포함하고 확인되지 않은 수치는 가설로 명시합니다. 최종 사용자용 go-to-market 문서는 Documentation Agent가 별도 branch에서 이 분석 PR을 검증한 뒤 작성합니다.`,
    dependsOn: upstream,
    acceptanceCriteria: [
      `${PRODUCT_MARKETING_POLICY.analysisPath}가 실제 repository에 존재하고 현재 제품 기능/타깃 사용자와 일치한다.`,
      "관찰 사실·실제 데이터·외부 출처·추론·실험 가설이 구분되어 있으며 확인되지 않은 시장/성과 수치를 사실처럼 사용하지 않는다.",
      "타깃 세그먼트, 핵심 가치 제안, 포지셔닝, 획득 채널 우선순위와 채널 선택 근거가 포함된다.",
      "activation/conversion/retention 퍼널과 north-star/guardrail metric, 필요한 analytics event 정의가 포함된다.",
      "SEO/콘텐츠/커뮤니티/파트너십/유료 실험 중 제품에 맞는 항목만 우선순위와 성공/중단 기준을 포함해 제안한다.",
      "개인정보 최소 수집, 민감정보 제외, 측정 데이터 보존/접근 고려사항이 포함된다.",
    ],
  };
  tasks.push(marketingTask);

  const documentationTask: ProjectTaskPlan = {
    id: nextTaskId(tasks, "MKTDOC"),
    title: "마케팅 전략 문서 검증 및 제품 문서 통합",
    role: "documentation",
    taskSlug: nextTaskSlug(tasks, "marketing-documentation"),
    summary: `Data & Marketing Agent의 ${PRODUCT_MARKETING_POLICY.analysisPath} PR을 직접 확인하고 실제 release repository와 독립 대조합니다. 검증 가능한 내용만 사용해 ${PRODUCT_MARKETING_POLICY.documentPath}를 작성하고 과장되거나 근거 없는 주장을 제거하며 README 또는 적절한 문서 인덱스에서 최종 전략을 연결합니다.`,
    dependsOn: [marketingTask.id],
    acceptanceCriteria: [
      `Documentation Agent가 Data & Marketing PR의 ${PRODUCT_MARKETING_POLICY.analysisPath}와 실제 제품 기능, 기능명, 링크, 측정 항목을 대조한다.`,
      `${PRODUCT_MARKETING_POLICY.documentPath}가 Documentation Agent branch에서 생성되고 evidence와 hypothesis 구분을 보존한다.`,
      "마케팅 주장이 실제 evidence인지 가설인지 구분되어 있고 출처 없는 숫자/성과 보장은 제거된다.",
      "README 또는 적절한 문서 인덱스에서 마케팅/출시 전략 문서를 찾을 수 있도록 연결한다.",
      "analytics/marketing 설정에 외부 계정이나 credential이 필요하면 변수/설정 위치만 문서화하고 secret 값은 기록하지 않는다.",
    ],
  };
  tasks.push(documentationTask);

  const codeReviewTask: ProjectTaskPlan = {
    id: nextTaskId(tasks, "MKTCR"),
    title: "마케팅 및 문서 PR 코드 리뷰",
    role: "code-review",
    taskSlug: nextTaskSlug(tasks, "marketing-docs-code-review"),
    summary: "Data & Marketing Agent와 Documentation Agent의 실제 PR diff를 함께 검토해 분석 정확성, 최종 문서 정확성, analytics 변경, 개인정보/보안 위험, 깨진 링크, 근거 없는 주장과 repository 일관성을 독립 확인합니다.",
    dependsOn: [marketingTask.id, documentationTask.id],
    acceptanceCriteria: [
      "두 Agent의 실제 PR을 모두 확인하고 reviewedPullRequests에 기록한다.",
      "분석 문서와 최종 go-to-market 문서가 역할을 분리하면서도 서로 모순되지 않는지 확인한다.",
      "문서/analytics 변경이 실제 코드와 충돌하지 않는지 확인하고 근거 있는 verdict를 남긴다.",
    ],
  };
  tasks.push(codeReviewTask);

  const reviewerTask: ProjectTaskPlan = {
    id: nextTaskId(tasks, "MKTREV"),
    title: "제품 마케팅 전략 완성도 검토",
    role: "reviewer",
    taskSlug: nextTaskSlug(tasks, "marketing-product-review"),
    summary: "제품 요구사항, 실제 사용자 가치와 release 상태를 기준으로 마케팅 전략의 타깃/포지셔닝/채널/지표/실험 계획이 제품과 일치하는지 독립 검토합니다.",
    dependsOn: [codeReviewTask.id],
    acceptanceCriteria: [
      "마케팅 전략이 실제 제품 가치와 타깃 사용자를 왜곡하지 않는지 검토한다.",
      "실행 불가능하거나 근거가 약한 마케팅 제안은 명확한 evidence와 함께 수정 요청한다.",
    ],
  };
  tasks.push(reviewerTask);

  const qaTask: ProjectTaskPlan = {
    id: nextTaskId(tasks, "MKTQA"),
    title: "마케팅 문서 및 측정 계획 QA",
    role: "qa",
    taskSlug: nextTaskSlug(tasks, "marketing-documentation-qa"),
    summary: "최종 마케팅/문서화 결과의 파일 존재, 링크, 제품 사실, analytics event/측정 계획, 민감정보 노출 여부를 실제 repository와 두 upstream PR에서 검증합니다.",
    dependsOn: [reviewerTask.id],
    acceptanceCriteria: [
      `${PRODUCT_MARKETING_POLICY.analysisPath}와 ${PRODUCT_MARKETING_POLICY.documentPath}의 책임 분리가 명확하고 최종 통합 후 두 경로가 실제로 열릴 수 있다.`,
      "문서에 secret, 실제 토큰, 비밀번호 또는 검증되지 않은 성과 수치가 포함되지 않는다.",
      "제품 기능/출시 상태와 마케팅 문서가 일치하며 검증하지 못한 외부 조건은 blocker 또는 가설로 표시된다.",
    ],
  };
  tasks.push(qaTask);

  const nextPlan = { ...plan, tasks };
  validateMarketingDocumentationPlan(nextPlan);
  return nextPlan;
}
