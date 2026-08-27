# BloomBouquet Evaluator Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claim BloomBouquet evaluation runs, execute independent senior evaluator Agents, persist each report, and aggregate only after all required evaluations exist.

**Architecture:** Keep evaluator orchestration separate from the existing autonomous Builder writer flow. Add a dedicated worker HTTP client, evaluator orchestration module, strict senior prompt/JSON contract, and a Codex app-server adapter; `bloom-worker/run.js` polls evaluator work before legacy Builder work.

**Tech Stack:** TypeScript 5.7, Node.js 22, Codex app-server stdio protocol, Spring Boot internal worker API, existing Bloom policy-test harness.

**Spec:** `docs/superpowers/specs/2026-08-27-bloombouquet-evaluator-worker-design.md`

## Global Constraints

- Evaluators are 10+ year senior specialists and must remain independent.
- Independent Agent input must never contain another evaluator's report, score, or conclusion.
- Process Evaluator runs only after every role required by `createEvaluationPlan()` has a persisted result.
- Evaluator code must not use repository write, branch, commit, push, PR create, PR merge, or deployment permissions.
- Missing browser/source evidence must be reported as not observed instead of fabricated.
- Existing submission/version/evaluation history must never be overwritten.

---

### Task 1: Evaluator Worker HTTP Client

**Files:**
- Create: `bloom-runtime/ts/bloomBouquetEvaluatorHttpClient.ts`
- Create: `bloom-runtime/ts/bloomBouquetEvaluatorHttpClient.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`
- Modify: `bloom-runtime/tsconfig.worker.json`

**Interfaces:**
- Produces `BloomBouquetEvaluationClaim`, `BloomBouquetAgentResultPayload`, `BloomBouquetEvaluatorClient`.
- Produces `createBloomBouquetEvaluatorHttpClient({ baseUrl, token, fetchImpl? })`.
- Client methods: `claim()`, `listAgentEvaluations(runId)`, `recordAgentEvaluation(runId, payload)`, `complete(runId, payload)`.

- [ ] **Step 1: Write the failing HTTP contract test**

Test fake fetch requests for:

```text
POST /api/internal/builder/worker/bloom-bouquet/claim
GET  /api/internal/builder/worker/bloom-bouquet/evaluations/{runId}/agents
POST /api/internal/builder/worker/bloom-bouquet/evaluations/{runId}/agents
POST /api/internal/builder/worker/bloom-bouquet/evaluations/{runId}/complete
```

Assert every request has `X-Builder-Worker-Token`, JSON bodies are exact, and claim handles HTTP 204 as `null`.

- [ ] **Step 2: Run `pnpm run test:bloom-runtime` and verify RED**

Expected: TypeScript compile fails because `bloomBouquetEvaluatorHttpClient` does not exist.

- [ ] **Step 3: Implement minimal client**

Reuse the Builder client's HTTPS/loopback URL and 32+ char token policy. Parse non-2xx responses into a dedicated HTTP error without logging secrets.

- [ ] **Step 4: Run `pnpm run test:bloom-runtime` and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add BloomBouquet evaluator worker client"
```

---

### Task 2: Independent Evaluator Orchestration

**Files:**
- Create: `bloom-runtime/ts/bloomBouquetEvaluatorWorker.ts`
- Create: `bloom-runtime/ts/bloomBouquetEvaluatorWorker.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`
- Modify: `bloom-runtime/tsconfig.worker.json`

**Interfaces:**

```ts
export type SeniorEvaluatorRunner = {
  evaluate(input: IndependentEvaluatorInput): Promise<AgentEvaluation>;
  aggregate(input: AggregateEvaluatorInput): Promise<{ overallScore: number; overallStars: number; reportSummary: string }>;
};

export async function runBloomBouquetEvaluatorOnce(
  client: BloomBouquetEvaluatorClient,
  runner: SeniorEvaluatorRunner,
): Promise<{ status: "idle" | "completed" | "partial"; runId?: number }>;
```

- [ ] **Step 1: Write failing orchestration tests**

Use a fake client/runner and assert:
- no claim returns `idle`;
- `createEvaluationPlan()` controls required roles;
- persisted roles are skipped;
- each independent call sees submission metadata/checklists but receives no `existingEvaluations` field;
- every new result is persisted immediately;
- aggregate receives all persisted independent results only after required role completion;
- a thrown Agent error returns/rethrows without calling `complete` and preserves prior persisted work.

- [ ] **Step 2: Run policy tests and verify RED**

- [ ] **Step 3: Implement orchestration using `createEvaluationPlan()` and `bouquetAuthEvaluationChecklist()`**

Do not duplicate role-selection rules in the worker.

- [ ] **Step 4: Run policy tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: orchestrate independent BloomBouquet evaluations"
```

---

### Task 3: Senior Evaluator Prompt and Codex Adapter

**Files:**
- Create: `bloom-runtime/ts/bloomBouquetSeniorEvaluator.ts`
- Create: `bloom-runtime/ts/bloomBouquetSeniorEvaluator.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`
- Modify: `bloom-runtime/tsconfig.worker.json`

**Interfaces:**

```ts
export function buildIndependentEvaluatorPrompt(input: IndependentEvaluatorInput): string;
export function buildAggregateEvaluatorPrompt(input: AggregateEvaluatorInput): string;
export function parseIndependentEvaluatorOutput(value: unknown): AgentEvaluation;
export function parseAggregateEvaluatorOutput(value: unknown): AggregateEvaluationResult;
```

Production adapter:

```ts
export function createCodexSeniorEvaluatorRunner(options?: { command?: string }): SeniorEvaluatorRunner;
```

- [ ] **Step 1: Write failing prompt/schema tests**

Assert independent prompt includes role, demo URL, available repo evidence, senior report contract, and explicit non-fabrication/write prohibition. Assert it excludes other Agent results. Assert aggregate prompt contains independent reports and requires only overall fields.

- [ ] **Step 2: Run policy tests and verify RED**

- [ ] **Step 3: Implement strict validators and Codex app-server stdio runner**

Use a read-only sandbox policy and network access for observation. Return strict JSON only. Never add repository writable roots.

- [ ] **Step 4: Run policy tests and worker TypeScript build**

Commands:

```bash
pnpm run test:bloom-runtime
pnpm run build:bloom-worker
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add senior evaluator Codex runtime"
```

---

### Task 4: Production Worker Loop Integration

**Files:**
- Modify: `bloom-worker/run.js`
- Modify: `bloom-worker/README.md`
- Modify: `.env.example`
- Create or extend: `bloom-runtime/ts/bloomBouquetEvaluatorWorker.policy-test.ts`

**Interfaces:**
- `run.js` creates evaluator client + Codex runner once at startup.
- Each cycle calls `runBloomBouquetEvaluatorOnce()` first.
- When evaluator status is not `idle`, the cycle does not claim a Builder writer run.
- When evaluator status is `idle`, existing `runBuilderWorkerOnce()` behavior remains unchanged.

- [ ] **Step 1: Add failing loop/policy assertion**

Assert worker source imports evaluator modules and evaluator-first behavior is represented without deleting legacy Builder fallback.

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Wire evaluator-first cycle and update runtime docs/config comments**

No new secret is introduced; reuse `BUILDER_WORKER_TOKEN` and `BLOOM_API_BASE_URL`.

- [ ] **Step 4: Run targeted GREEN checks**

```bash
pnpm run test:bloom-runtime
pnpm run build:bloom-worker
pnpm run build:bloom-web
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: run BloomBouquet evaluator in headless worker"
```

---

### Task 5: Full Verification and PR

**Files:**
- No product code unless a verification failure exposes a real defect.

- [ ] **Step 1: Run the complete Harness**

Use repository CI Harness and require every Backend, web, Agent runtime, worker, Rust/Tauri, and invariant step to pass.

- [ ] **Step 2: Review diff for evaluator independence and secret safety**

Confirm no writer permission is introduced and no token/secret can enter logs or prompts.

- [ ] **Step 3: Push/open PR to `main` using the repository's required PR template**

Title:

```text
feat : BloomBouquet 시니어 Evaluator Worker 추가
```
