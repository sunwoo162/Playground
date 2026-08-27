# BloomBouquet Local Evaluator Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the production BloomBouquet senior evaluator without interactive Codex authentication while preserving independent, read-only, evidence-grounded evaluation.

**Architecture:** Add a dedicated local evaluator transport that talks directly to a local llama.cpp OpenAI-compatible endpoint and never exposes Builder write/Git/PR tools. A separate evidence collector gathers bounded read-only demo and public GitHub evidence with SSRF protections; unavailable interaction/runtime facts remain explicitly `not observed`. Production provisions a single Qwen2.5-Coder 1.5B Q4_K_M llama.cpp service and selects `BLOOM_EVALUATOR_RUNTIME=local`, while Codex remains an optional non-production transport.

**Tech Stack:** TypeScript, Node.js HTTP/HTTPS/DNS APIs, llama.cpp, Qwen2.5-Coder-1.5B-Instruct GGUF, PM2, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-27-bloombouquet-evaluator-worker-design.md`

## Global Constraints

- Independent evaluator results must remain independent from other evaluator scores/conclusions.
- Evaluator runtime is read-only and must not expose repository write, branch, commit, push, PR, merge, release, or deploy tools.
- Demo evidence fetches must reject loopback, private, link-local, documentation/test, multicast, and other non-public addresses before connecting and on redirects.
- Repository source collection supports public `https://github.com/<owner>/<repo>` URLs only; failures become explicit evidence limitations.
- Collected evidence is bounded so the local 8192-token context cannot be exhausted by arbitrary remote content.
- Production does not require `codex login status`.
- Existing Codex evaluator remains available as an explicit runtime option for non-production use.

---

### Task 1: Lock local evaluator contracts with RED tests

**Files:**
- Create: `bloom-runtime/ts/bloomBouquetLocalSeniorEvaluator.policy-test.ts`
- Create: `bloom-runtime/ts/bloomBouquetEvaluatorEvidence.policy-test.ts`
- Modify: `bloom-runtime/tsconfig.policy-tests.json`
- Modify: `scripts/production-runtime.policy-test.js`

**Interfaces:**
- Produces tests for strict local JSON transport, evidence injection, SSRF blocking, GitHub-only source evidence, and production local-runtime selection.

- [ ] Add tests that a fake local completion endpoint receives the requested output schema and malformed JSON is rejected/retried.
- [ ] Add tests that independent prompts receive collected evidence but never another evaluator's findings.
- [ ] Add pure network-policy tests for public IPv4/IPv6 vs loopback/private/link-local/test ranges.
- [ ] Add production policy tests requiring `BLOOM_EVALUATOR_RUNTIME local`, local model provisioning, and absence of `codex login status`.
- [ ] Run PR Harness and confirm `Test production runtime policy` or Bloom runtime policy fails before implementation.

### Task 2: Implement bounded read-only evidence collection

**Files:**
- Create: `bloom-runtime/ts/bloomBouquetEvaluatorEvidence.ts`

**Interfaces:**
- Produces `EvaluatorEvidenceProvider.collect(input: IndependentEvaluatorInput): Promise<string>`.
- Uses a pinned DNS resolution for arbitrary demo HTTP(S) requests and manually validates each redirect.
- Uses fixed GitHub API/raw hosts for public repository metadata/tree/file evidence.

- [ ] Implement public-address classification and reject unsafe hostnames/addresses.
- [ ] Implement bounded HTTP(S) text fetch with timeout, pinned DNS lookup, redirect revalidation, response-size limit, and no credentials/cookies.
- [ ] Implement cached demo evidence collection (status, final URL, selected headers, bounded HTML/text excerpt).
- [ ] Implement cached public GitHub evidence (metadata, bounded tree, small high-signal README/manifest/source/config/test excerpts).
- [ ] Convert fetch/source failures into explicit `not observed` evidence rather than fabricated observations.

### Task 3: Implement evaluator-only local inference transport

**Files:**
- Create: `bloom-runtime/ts/bloomBouquetLocalSeniorEvaluator.ts`
- Modify: `bloom-runtime/tsconfig.worker.json`

**Interfaces:**
- Produces `createLocalSeniorEvaluatorRunner(options): SeniorEvaluatorRunner`.
- Calls local `POST /v1/chat/completions` with strict schema instructions and bounded retries.
- Reuses existing `buildIndependentEvaluatorPrompt`, `buildAggregateEvaluatorPrompt`, `parseIndependentEvaluatorOutput`, and `parseAggregateEvaluatorOutput`.

- [ ] Append collected evidence only to the current independent evaluator prompt.
- [ ] Send no tool capabilities to the local model.
- [ ] Parse exactly one JSON object and retry format failures a bounded number of times.
- [ ] Keep Process Evaluator input limited to persisted independent reports, with no new evidence invention.

### Task 4: Select runtime in the headless worker

**Files:**
- Modify: `bloom-worker/run.js`
- Modify: `bloom-worker/run.policy-test.js`

**Interfaces:**
- `BLOOM_EVALUATOR_RUNTIME=local|codex`.
- Production default/configuration is `local`; explicit `codex` remains supported.

- [ ] Add validated runtime selection and construct the matching evaluator runner.
- [ ] Log evaluator runtime name without secrets.
- [ ] Preserve existing worker identity, lease, heartbeat, and failure semantics.

### Task 5: Provision one local evaluator model in production

**Files:**
- Create: `bloom-worker/start-local-evaluator-llm.sh`
- Create: `scripts/setup-bloom-evaluator-local-llm.sh`
- Modify: `.github/workflows/deploy-bloom-worker.yml`
- Modify: `.env.example`

**Interfaces:**
- Local endpoint defaults to `http://127.0.0.1:8091/v1/chat/completions`.
- Model defaults to `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M`.
- llama service is single-parallelism and resource bounded.

- [ ] Provision/start llama.cpp local model before evaluator worker startup.
- [ ] Health-check the local model endpoint without printing model/user data.
- [ ] Force `BLOOM_EVALUATOR_RUNTIME=local` and remove Codex login preflight from production.
- [ ] Keep PM2 evaluator-mode startup verification.

### Task 6: Verify, review, merge, deploy

- [ ] Require full Harness PASS.
- [ ] Review for SSRF, prompt injection, secret leakage, evaluator write capability, unbounded content, and stale-worker regressions.
- [ ] Open/update PR using the repository PR format.
- [ ] Merge only after GREEN verification.
- [ ] Verify `Deploy to Server` and subsequent `Deploy Bloom Worker` production runs.
- [ ] Confirm the worker stays online in `mode=evaluator` with `runtime=local` and local model health passes.
