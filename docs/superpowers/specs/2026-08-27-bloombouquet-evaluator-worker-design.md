# BloomBouquet Evaluator Worker Design

## Goal

BloomBouquet에 등록된 프로젝트 Submission의 `QUEUED` Evaluation Run을 worker가 claim하고, 10년 이상 경력의 시니어 평가 Agent들을 서로 독립적으로 실행해 Agent별 보고서를 저장한 뒤, 모든 필수 독립 평가가 완료된 경우에만 Process Evaluator가 최종 점수/별점/요약을 확정한다.

## Existing Boundaries Reused

- Backend가 `claim`, Agent result 기록, Agent result 조회, `complete` worker API를 소유한다.
- `evaluationPlatform.ts`가 evaluator role, 독립 실행 계획, senior report contract, Bouquet auth checklist를 소유한다.
- 기존 자율 코딩 worker는 repository writer/PR 생성 흐름을 계속 담당하지만 BloomBouquet evaluator는 writer 권한을 사용하지 않는다.
- 기존 Builder worker token을 내부 worker 인증 경계로 재사용한다.

## Worker Architecture

Evaluator runtime을 Builder 실행기와 분리한다.

1. `BloomBouquetEvaluatorHttpClient`
   - `/api/internal/builder/worker/bloom-bouquet/*` endpoint만 호출한다.
   - claim, Agent 평가 기록, 기존 평가 조회, final complete를 제공한다.
   - token, base URL, HTTP error handling 정책은 기존 Builder HTTP client와 동일한 수준으로 유지한다.

2. `BloomBouquetEvaluatorWorker`
   - claim payload를 `ProjectSubmissionInput`으로 변환한다.
   - `createEvaluationPlan()`으로 필수 independent role 목록을 결정한다.
   - 서버에 이미 저장된 Agent 평가를 읽고 완료된 role은 재실행하지 않는다.
   - 미완료 independent role만 하나씩 evaluator runner에 전달한다.
   - 각 Agent 실행 입력에는 다른 Agent의 평가/점수/결론을 절대 넣지 않는다.
   - 각 결과를 즉시 Backend에 저장한다.
   - 모든 필수 independent role이 저장된 뒤에만 aggregate runner를 실행한다.
   - Process Evaluator 입력에만 독립 평가 전체를 포함한다.

3. `SeniorEvaluatorRunner`
   - worker orchestration은 구체적인 LLM provider에 의존하지 않고 interface에 의존한다.
   - production adapter는 현재 배포 환경에서 이미 사용하는 Codex app-server 경계를 재사용한다.
   - independent Agent는 read-only evaluation prompt와 strict JSON schema를 사용한다.
   - Process Evaluator는 independent reports만 읽고 source verdict를 재작성하지 않으며 overall report를 생성한다.

## Evidence Policy

- `demoUrl`은 모든 independent role에 공통으로 제공한다.
- `frontendRepositoryUrl`은 Frontend/Code Review 등 source evidence가 필요한 role에만 source evidence로 사용할 수 있다.
- `backendRepositoryUrl`이 없으면 Backend Agent 자체를 계획하지 않는다.
- source URL이 없는 role은 내부 구현을 관찰했다고 주장할 수 없다.
- `requiresAuth=true`인 경우 Bouquet auth checklist를 추가 evidence checklist로 제공하되, metadata 자체를 인증 성공 증거로 취급하지 않는다.
- 이번 PR은 browser automation을 가짜로 구현하지 않는다. Browser/evidence collector는 별도 adapter로 연결할 수 있게 입력 경계를 유지하고, 실제 관찰이 없는 경우 evaluator는 `not observed`로 보고해야 한다.

## Senior Report Contract

Independent Agent output:

- `agentRole`
- `score` 0..100
- `stars` 1.0..5.0
- `assessment`
- `evidence[]`
- `severity`: info/low/medium/high/critical
- `impact`
- `recommendation`
- `priority`: p3/p2/p1/p0
- `confidence`: low/medium/high
- `technicalTerms[]`

Prompt rules:

- 최소 10년 경력의 해당 도메인 시니어 관점으로 진단한다.
- 전문 용어는 진단 정밀도를 높일 때만 사용한다.
- 모든 판단은 evidence → impact → recommendation으로 연결한다.
- 다른 evaluator의 결론/점수에 anchor하지 않는다.
- 관찰하지 못한 사실, 실행하지 않은 테스트, 없는 repository evidence를 생성하지 않는다.
- writer 권한, branch 생성, commit, push, PR 생성/merge를 수행하지 않는다.

Process Evaluator output:

- `overallScore`
- `overallStars`
- `reportSummary`

Process Evaluator는 모든 필수 independent Agent 결과가 존재할 때만 실행한다.

## Retry and Idempotency

- claim된 run이 `RUNNING`인 동안 worker가 재시작될 수 있으므로 Backend에 이미 저장된 role 목록을 source of truth로 사용한다.
- 이미 기록된 role은 건너뛴다.
- Agent 하나가 실패하면 아직 성공한 Agent 결과를 삭제하지 않고 run을 미완료 상태로 남겨 다음 복구 경로가 이어받을 수 있게 한다.
- 동일 Submission의 과거 Evaluation Run이나 이전 버전 결과를 덮어쓰지 않는다.

## Worker Loop Integration

기존 `bloom-worker/run.js`는 한 poll cycle에서 BloomBouquet 평가를 먼저 시도하고, 평가가 없을 때 기존 Builder run을 claim한다. 이렇게 하면 evaluator workload가 writer flow와 섞이지 않으면서 동일 프로세스/인증/운영 환경을 재사용할 수 있다.

## Testing

Policy/unit tests에서 다음을 검증한다.

- HTTP endpoint/path/body/token 계약
- repo URL에 따른 evaluator role 선택
- 독립 Agent input에 다른 Agent 결과가 포함되지 않음
- 이미 저장된 role skip
- Agent result 즉시 persistence
- 모든 필수 role 이전 Process Evaluator 실행 금지
- aggregate input에는 independent results 포함
- Backend duplicate protection과 함께 retry 시 중복 결과를 만들지 않음
- evaluator worker가 writer permission/path를 사용하지 않음
- worker TypeScript build와 전체 Harness regression
