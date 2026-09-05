# Bloom Harness Offline Benchmark Design

> 기준 브랜치: `origin/main`
> 기준 커밋: `997837f`
> 작성일: 2026-09-05

## 1. 목적

Bloom Harness는 Live Pack Binding, PM Pack Plan Policy, Runtime Completion Adapter,
trusted task evidence, project Pack completion gate까지 실제 실행 경로에 연결되어 있다.
다음 단계는 Harness 코드가 변경될 때 동일한 신뢰 입력에 대한 판정이 의도치 않게
달라지는지를 CI에서 재현 가능하게 감지하는 것이다.

v1은 실제 Agent/Builder를 다시 실행하는 live benchmark가 아니다. 저장된 정규화 fixture를
현재 Harness evaluator로 평가하고, 승인된 golden 결과와 정확히 비교하는 deterministic
offline regression benchmark다.

성공 기준은 다음 한 문장으로 정의한다.

> 같은 fixture와 같은 commit에서는 언제 실행해도 byte-for-byte 동일한 평가 결과를 만들고,
> 승인되지 않은 Harness 판정 변화는 CI를 실패시킨다.

## 2. 비목표

v1에는 LLM 평가, 실제 Builder/Agent 실행, GitHub/network 접근, repository clone,
0~100 점수화, live run artifact 자동 수집, Team Evolution 자동 rollback을 포함하지 않는다.
retry/replan/failure-route tolerance를 이용한 paired-run 비교도 v2 Live Benchmark 범위다.
## 3. 핵심 원칙

1. **Deterministic first**: 시간, 절대 경로, 랜덤 ID, 현재 git SHA를 결과에 넣지 않는다.
2. **Production semantics reuse**: Pack binding/task completion/Pack completion validation은
   기존 production validator와 gate를 재사용한다.
3. **Minimal fixture**: `ProjectState` 전체가 아니라 evaluator가 실제로 필요한 최소 입력만 저장한다.
4. **Stable diagnostics**: golden은 사람이 읽는 error string이 아니라 stable violation code를 비교한다.
5. **Read-only CI**: CI는 golden을 절대 수정하지 않는다.
6. **Explicit golden updates**: expectation 변경은 로컬 명시 명령과 git diff를 통해서만 허용한다.
7. **No hidden inference**: offline evaluator는 fixture에 저장된 Pack binding을 사용하며 intent 재추론을 하지 않는다.

## 4. 아키텍처

```text
Golden Fixture Bundle
  ├─ run.json
  └─ expected.json
        ↓
Harness Benchmark Loader
        ↓
Harness Offline Evaluator
  ├─ fixture validation
  ├─ Pack binding validation
  ├─ trusted task evidence validation
  ├─ project Pack completion gate
  └─ operational metric collection
        ↓
Harness Benchmark Comparator
        ↓
Suite Regression Report
        ↓
CLI / CI exit code
```

기존 BloomBouquet senior evaluator, browser evaluator, repository evidence collector는 호출하지 않는다.
## 5. 모듈 경계

```text
bloom-runtime/ts/
  harnessBenchmarkContracts.ts
  harnessBenchmarkLoader.ts
  harnessOfflineEvaluator.ts
  harnessBenchmarkComparator.ts
  harnessBenchmarkSuite.ts

bloom-runtime/fixtures/harness-benchmarks/
  <case-id>/
    run.json
    expected.json

scripts/
  harness-benchmark.cjs
```

각 모듈 책임은 다음과 같다.

- `harnessBenchmarkContracts.ts`: fixture/result/violation schema와 validator.
- `harnessBenchmarkLoader.ts`: filesystem과 JSON 읽기, case directory discovery.
- `harnessOfflineEvaluator.ts`: 순수 평가 로직. filesystem, stdout, network를 모른다.
- `harnessBenchmarkComparator.ts`: expected와 candidate exact comparison.
- `harnessBenchmarkSuite.ts`: case 정렬, 중복/누락 검사, suite summary 생성.
- `scripts/harness-benchmark.cjs`: CLI argument, 출력, update policy, process exit code 담당.

핵심 API는 다음 형태를 유지한다.

```ts
loadHarnessBenchmarkCase(caseDir)
evaluateHarnessBenchmarkCase(fixture)
compareHarnessBenchmarkResult(expected, candidate)
runHarnessBenchmarkSuite(rootDir)
```

## 6. Fixture schema

`run.json`은 branch/worktree/session/path 같은 실행 부수정보를 저장하지 않는다.
Production Pack Gate가 읽는 최소 task view와 운영 counter만 정규화해 저장한다.

```ts
type HarnessBenchmarkRunFixture = {
  version: 1;
  caseId: string;
  description: string;
  binding: HarnessPackBinding;
  tasks: Array<{
    taskId: string;
    role: ExecutableAgentRole;
    status: TaskRunStatus;
    attempts: number;
    verification: AgentTaskVerification[];
    harnessCompletion: HarnessTaskCompletionRecord | null;
  }>;
  operational: {
    failureRouteCount: number;
    replanCount: number;
  };
};
```

fixture loader는 directory 이름과 `caseId`가 정확히 같아야 한다고 요구한다.
모든 counter는 0 이상의 정수여야 하며 taskId는 한 case 안에서 중복될 수 없다.
loader는 benchmark envelope와 primitive shape만 검증하고, nested Pack binding/task completion의
production 의미 검증은 evaluator에 맡긴다. `expected.json`은 먼저 정상 로드/검증해야 한다.
`run.json` 파일 자체가 없거나 regular file이 아니면 benchmark 정의 오류로 즉시 process failure다.
반면 run 파일이 존재하지만 JSON parse 또는 primitive benchmark schema validation이 실패하면 loader는
전용 run-schema error를 던지고 suite가 directory caseId를 사용해 `invalid / FIXTURE_SCHEMA_INVALID` candidate로
변환한다. `expected.json` parse/schema 오류는 golden 자체 손상이므로 항상 process failure다.

Production `evaluateHarnessPackProjectCompletion()`은 구현 시 `ProjectTaskRun[]` 전체 대신
structural typing 가능한 최소 task view를 받도록 입력 타입을 좁힌다. Live runtime은 기존
`ProjectTaskRun[]`을 그대로 넘길 수 있으므로 동작 변화는 없어야 한다.

## 7. Expected result schema

`expected.json`은 accepted baseline이자 golden expectation이다. 별도 `baseline.json`은 두지 않는다.

```ts
type HarnessBenchmarkVerdict = "pass" | "fail" | "invalid";

type HarnessBenchmarkExpected = {
  version: 1;
  caseId: string;
  verdict: HarnessBenchmarkVerdict;
  violations: HarnessBenchmarkViolationCode[];
  metrics: {
    packBound: boolean;
    taskCount: number;
    acceptedTaskCount: number;
    retryCount: number;
    failureRouteCount: number;
    replanCount: number;
    verificationIssueCount: number;
    requiredEvidenceKindsPresent: number;
    requiredEvidenceKindsTotal: number;
    completionGateReady: boolean;
  } | null;
};
```

`invalid` verdict는 production 의미 검증이 완료되지 않았으므로 `metrics:null`이어야 한다.
`pass`와 `fail`만 full metrics를 가진다. `pass`의 violations는 반드시 빈 배열이다.
coverage는 float로 저장하지 않는다. `present/total` 정수 쌍만 golden에 저장하고 CLI가 표시할 때만
비율로 계산한다. violation code는 중복 제거 후 stable canonical order로 정렬한다.

결과 JSON에는 timestamp, absolute path, random ID, 현재 git SHA를 포함하지 않는다.
동일 입력을 두 번 평가한 serialized JSON은 byte-for-byte 같아야 한다.

## 8. Verdict와 violation taxonomy

`pass`는 정상 계약 입력이 모든 Harness completion 조건을 충족한 상태다.
`fail`은 입력 구조는 정상이나 정책상 완료로 인정할 수 없는 상태다.
`invalid`는 fixture/run 자체가 손상되었거나 내부 계약이 모순되는 상태다.

초기 stable violation code는 다음으로 제한한다.

```text
FIXTURE_SCHEMA_INVALID
PACK_BINDING_INVALID
PACK_BINDING_BLOCKED
TASK_COMPLETION_INVALID
DUPLICATE_EVIDENCE_ID
TASK_NOT_DONE
MISSING_TRUSTED_COMPLETION
TASK_COMPLETION_REJECTED
MISSING_REQUIRED_EVIDENCE
```

분류 예시는 다음과 같다.

- required `test` 또는 `review` evidence 누락 → `fail / MISSING_REQUIRED_EVIDENCE`
- task status가 `done`이 아님 → `fail / TASK_NOT_DONE`
- done task에 trusted Harness completion 없음 → `fail / MISSING_TRUSTED_COMPLETION`
- valid `accepted:false` completion → `fail / TASK_COMPLETION_REJECTED`
- malformed Pack binding → `invalid / PACK_BINDING_INVALID`
- valid blocked Pack binding → `fail / PACK_BINDING_BLOCKED`
- accepted completion이 자신의 required evidence를 충족하지 못함 → `invalid / TASK_COMPLETION_INVALID`
- task 내부 또는 project aggregate에서 evidence id 중복 → `invalid / DUPLICATE_EVIDENCE_ID`
- fixture version/counter/case identity 자체가 잘못됨 → `invalid / FIXTURE_SCHEMA_INVALID`

production validator가 throw하는 경우 evaluator는 raw error string을 golden으로 저장하지 않고
위 stable code로 변환한다. `fail` 결과는 하나의 primary reason만 고르지 않고 같은 정상 입력에서
관찰되는 모든 stable policy violation을 canonical order로 함께 기록한다. 예를 들어 rejected bound task가
Pack evidence coverage도 잃으면 `TASK_COMPLETION_REJECTED`와 `MISSING_REQUIRED_EVIDENCE`를 둘 다 기록한다.
예상하지 못한 validator 오류는 숨기지 말고 benchmark process를 실패시킨다.

## 9. 초기 golden suite

v1은 최소 6개 case로 시작한다.

1. `bug-fix-complete`: bound `bug-fix`, trusted `file-change + review + test`, expected `pass`.
2. `missing-test-evidence`: 정상 completion 구조지만 project-level `test` 누락, expected `fail`.
3. `missing-review-evidence`: 정상 completion 구조지만 project-level `review` 누락, expected `fail`.
4. `rejected-task`: valid `accepted:false` task completion 포함, expected `fail`.
5. `legacy-unbound`: explicit legacy-unbound binding, expected `pass` and no Pack-specific evidence requirement.
6. `corrupt-duplicate-evidence`: duplicate trusted evidence id 포함, expected `invalid`.

각 fixture의 `run.json`은 synthetic normalized data다. 실제 `.bloom/runs/*`를 복사하지 않는다.
시간 문자열이나 SHA가 필요하더라도 benchmark schema에 포함하지 않으므로 고정 metadata가 불필요하다.

## 10. 평가 데이터 흐름

1. suite가 fixture directory를 lexical order로 찾는다.
2. loader가 `expected.json`을 먼저 읽고 golden contract를 검증한다.
3. loader가 `run.json`을 읽는다. 파일 누락은 process failure, JSON/primitive schema 오류는 typed run-schema error다.
4. suite는 typed run-schema error만 `invalid / FIXTURE_SCHEMA_INVALID` candidate로 변환한다.
5. 정상 run은 evaluator가 저장된 `binding`과 trusted completion을 production validator로 검증한다.
6. evaluator는 task counters와 verification issue count를 deterministic하게 계산하고 production project completion semantics를 재사용한다.
7. nested validation corruption은 stable `invalid` code, 정상 정책 거부는 `fail` code로 분류한다.
8. comparator가 candidate와 expected의 verdict, ordered violations, metrics를 exact compare한다.
9. suite는 case별 결과와 전체 regression summary를 출력한다.

expected가 `fail` 또는 `invalid`인 case도 candidate가 같은 판정을 정확히 만들면 benchmark case 자체는 PASS다.

## 11. CLI와 golden update workflow

package scripts는 다음 두 개를 제공한다.

```text
pnpm run test:harness-benchmarks
pnpm run update:harness-benchmarks -- --case <case-id>
```

`test:harness-benchmarks`는 read-only다. 모든 case를 평가하고 expected와 exact compare하며,
어떤 파일도 수정하지 않는다. mismatch, duplicate case, missing file, unexpected evaluator error가 있으면 exit 1이다.

update mode는 다음 안전장치를 가진다.

- `CI=true` 또는 일반적인 CI environment 감지 시 즉시 거부한다.
- `--case <id>` 또는 명시적 `--all` 없이는 실행하지 않는다.
- `run.json`은 절대 수정하지 않는다.
- current evaluator 결과로 대상 `expected.json`만 갱신한다. present `run.json`의 primitive schema 오류도 test mode와 동일하게 `invalid / FIXTURE_SCHEMA_INVALID` candidate로 평가한다.
- update 후 suite를 다시 평가하여 새 expected와 candidate가 일치하는지 검증한다.
- 자동 git add/commit/push는 하지 않는다. semantic golden diff는 리뷰 가능한 상태로 남긴다.

## 12. Compile target와 CI integration

benchmark는 policy-test compile output과 분리한다.

```text
bloom-runtime/tsconfig.harness-benchmarks.json
  outDir: ../.tmp/harness-benchmarks
```

Harness workflow에는 다음 독립 step을 추가한다.

```text
Run Bloom agent runtime policy tests
Run Harness offline benchmarks
Build Bloom headless worker
```

`scripts/harness-check.js`에는 benchmark를 넣지 않는다. 기존 파일은 BloomBouquet production shell invariant만 담당한다.

## 13. 테스트 전략

TDD는 네 층으로 나눈다.

### Contracts
- unsupported fixture/result version 거부
- unknown verdict/violation code 거부
- negative/non-integer counter 거부
- directory 이름과 caseId mismatch 거부
- duplicate taskId 거부

### Offline evaluator
- complete bug-fix → `pass`
- missing test/review → `fail`
- rejected task → `fail`
- legacy-unbound → `pass`
- duplicate evidence → `invalid`
- malformed binding/completion → `invalid`

### Comparator / suite
- verdict mismatch 감지
- violation 추가/누락/순서 canonicalization 검증
- exact metric mismatch 감지
- case 누락/중복 감지
- lexical deterministic ordering 고정
- 동일 suite 2회 평가 JSON byte equality 검증

### CLI / CI policy
- test 명령이 fixture를 수정하지 않음
- update가 CI에서 거부됨
- update가 explicit target 없이는 거부됨
- update가 `run.json`을 수정하지 않음
- package scripts와 workflow 독립 benchmark step 연결 확인

## 14. Acceptance criteria

v1 구현 완료 조건은 다음과 같다.

- 6개 golden case가 repo에 포함되고 모두 deterministic하게 평가된다.
- `test:harness-benchmarks`가 read-only로 실행되며 golden mismatch 시 non-zero exit를 반환한다.
- `update:harness-benchmarks`는 CI에서 거부되고 explicit target 없이 실행되지 않는다.
- benchmark evaluator는 LLM, network, GitHub, repository clone을 호출하지 않는다.
- production Pack binding/task completion/project completion validator를 재사용한다.
- `ProjectTaskRun.evidence: string[]`는 trusted Pack evidence로 승격되지 않는다.
- legacy-unbound fixture는 current registry를 다시 조회하거나 Pack intent를 재추론하지 않는다.
- malformed/duplicate trusted evidence는 `invalid`로 분류된다.
- 정상 정책 미충족은 `fail`, 정상 충족은 `pass`로 분류된다.
- 같은 suite를 같은 commit에서 두 번 실행한 serialized result가 byte-for-byte 동일하다.
- Harness GitHub workflow의 독립 benchmark step이 green이어야 merge 가능하다.
- 기존 Bloom runtime policy, worker build, desktop build에는 회귀가 없어야 한다.

## 15. v2 Live Benchmark로 넘기는 항목

v2는 v1 evaluator를 폐기하지 않고 oracle/analysis layer로 재사용한다. 실제 paired run을 추가해
baseline Harness와 candidate Harness가 같은 fixture repository/request를 실행하도록 만들고,
retry rate, failure-route rate, verification issue rate, replan rate, human intervention 등을 비교한다.

그 단계에서만 현재 Team Evolution의 tolerance 개념을 공통 상수 또는 공통 comparison policy로 추출한다.
v1 offline fixture의 operational counters는 입력값이므로 해당 tolerance로 CI를 차단하지 않는다.

## 16. 구현 시 변경 예상 범위

- 새 benchmark contracts/loader/evaluator/comparator/suite 모듈과 policy tests
- 6개 normalized golden fixture directory
- benchmark 전용 TypeScript compile config
- `scripts/harness-benchmark.cjs`
- root `package.json` scripts
- `.github/workflows/harness.yml` benchmark step
- `harnessProjectCompletionGate.ts` 입력을 최소 structural task view로 좁히는 타입-only compatible 변경

이 범위를 넘어 live execution, evaluator UI, persistent benchmark database를 추가하지 않는다.
