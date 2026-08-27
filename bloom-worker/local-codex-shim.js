#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");

const DEFAULT_LLM_URL = "http://127.0.0.1:8091/v1/chat/completions";
const DEFAULT_MODEL = "qwen2.5-coder-1.5b-instruct";
const DEFAULT_MAX_TOKENS = 3072;
const DEFAULT_MAX_TOOL_TURNS = 24;
const MAX_TOOL_OUTPUT = 24 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_MODEL_RETRIES = 2;
const LOCK_STALE_MS = 60 * 60 * 1000;
const ALLOWED_PROGRAMS = new Set([
  "git", "gh", "pnpm", "npm", "npx", "node", "python", "python3",
  "cargo", "dotnet", "java", "javac", "mvn", "gradle",
]);
const SAFE_GH_ROOTS = new Set(["pr"]);

function envNumber(name, fallback, minimum = 0) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionId(prefix = "local") {
  return `${prefix}-${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2, 10)}`;
}

function parseJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error("Local LLM이 빈 응답을 반환했습니다.");
  const candidates = [trimmed];
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) candidates.push(fence[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next extraction strategy.
    }
  }
  throw new Error(`Local LLM JSON 파싱 실패: ${trimmed.slice(0, 500)}`);
}

function truncate(value, limit = MAX_TOOL_OUTPUT) {
  const text = String(value ?? "");
  if (Buffer.byteLength(text, "utf8") <= limit) return text;
  return `${Buffer.from(text, "utf8").subarray(0, limit).toString("utf8")}\n...[truncated]`;
}

function localResourceSnapshot() {
  let total = os.totalmem();
  let available = os.freemem();
  try {
    const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
    const values = new Map();
    for (const line of meminfo.split("\n")) {
      const match = line.match(/^([^:]+):\s+(\d+)\s+kB$/);
      if (match) values.set(match[1], Number(match[2]) * 1024);
    }
    total = values.get("MemTotal") || total;
    available = values.get("MemAvailable") || available;
  } catch {
    // Non-Linux environments use Node's portable memory values.
  }
  const usedRatio = total > 0 ? 1 - available / total : 0;
  return {
    total,
    available,
    usedRatio,
    load1: os.loadavg()[0] || 0,
    cpus: Math.max(1, os.cpus().length),
  };
}

async function waitForResources() {
  const maxMemoryRatio = envNumber("BLOOM_LOCAL_MAX_MEMORY_RATIO", 0.88, 0.5);
  const maxLoadPerCpu = envNumber("BLOOM_LOCAL_MAX_LOAD_PER_CPU", 1.0, 0.25);
  const pollMs = envNumber("BLOOM_LOCAL_RESOURCE_POLL_MS", 3000, 250);
  const maxWaitMs = envNumber("BLOOM_LOCAL_RESOURCE_MAX_WAIT_MS", 15 * 60 * 1000, 1000);
  const started = Date.now();
  while (true) {
    const snapshot = localResourceSnapshot();
    const memoryOk = snapshot.usedRatio <= maxMemoryRatio;
    const loadOk = snapshot.load1 <= snapshot.cpus * maxLoadPerCpu;
    if (memoryOk && loadOk) return snapshot;
    if (Date.now() - started >= maxWaitMs) {
      throw new Error(
        `Local Runtime resource guard timeout: memory=${Math.round(snapshot.usedRatio * 100)}% `
        + `load1=${snapshot.load1.toFixed(2)}/${snapshot.cpus}`,
      );
    }
    process.stderr.write(
      `[bloom-local] resource guard waiting memory=${Math.round(snapshot.usedRatio * 100)}% `
      + `load1=${snapshot.load1.toFixed(2)}/${snapshot.cpus}\n`,
    );
    await sleep(pollMs);
  }
}

async function acquireSessionLock() {
  const lockPath = process.env.BLOOM_LOCAL_SESSION_LOCK?.trim() || "/tmp/bloom-local-agent-session.lock";
  const pollMs = envNumber("BLOOM_LOCAL_LOCK_POLL_MS", 250, 50);
  while (true) {
    try {
      const fd = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(fd, `${process.pid}\n${Date.now()}\n`);
      return () => {
        try { fs.closeSync(fd); } catch { /* noop */ }
        try { fs.unlinkSync(lockPath); } catch { /* noop */ }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      await sleep(pollMs);
    }
  }
}

async function withLocalSession(fn) {
  const release = await acquireSessionLock();
  try {
    await waitForResources();
    return await fn();
  } finally {
    release();
  }
}

async function callLocalModel(messages, options = {}) {
  const url = process.env.BLOOM_LOCAL_LLM_URL?.trim() || DEFAULT_LLM_URL;
  const model = process.env.BLOOM_LOCAL_LLM_MODEL?.trim() || DEFAULT_MODEL;
  const maxTokens = envNumber("BLOOM_LOCAL_LLM_MAX_TOKENS", DEFAULT_MAX_TOKENS, 256);
  const timeoutMs = envNumber("BLOOM_LOCAL_LLM_TIMEOUT_MS", 10 * 60 * 1000, 5000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Local LLM HTTP ${response.status}: ${truncate(raw, 2000)}`);
    }
    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error(`Local LLM 응답에 message.content가 없습니다: ${truncate(raw, 2000)}`);
    }
    return { content, raw, model };
  } finally {
    clearTimeout(timer);
  }
}

async function completeJson(prompt, schemaText = "") {
  const system = [
    "You are Bloom's local inference engine.",
    "Return exactly one valid JSON object and no Markdown or commentary.",
    "Preserve explicit requirements. Never invent credentials, tests, deployments, metrics, or external state.",
    schemaText ? `Required JSON Schema:\n${schemaText}` : "",
  ].filter(Boolean).join("\n\n");
  let correction = "";
  let lastError;
  for (let attempt = 0; attempt <= MAX_MODEL_RETRIES; attempt += 1) {
    const result = await callLocalModel([
      { role: "system", content: system },
      { role: "user", content: `${prompt}${correction}` },
    ]);
    try {
      return { ...result, value: parseJsonObject(result.content) };
    } catch (error) {
      lastError = error;
      correction = "\n\nYour previous answer was not valid JSON. Retry from scratch with exactly one JSON object.";
    }
  }
  throw lastError || new Error("Local LLM JSON 생성 실패");
}

function safeWorkspacePath(cwd, requested, { write = false } = {}) {
  const root = fs.realpathSync(cwd);
  const raw = requested?.trim() || ".";
  const target = path.resolve(root, raw);
  const parent = fs.existsSync(target) ? fs.realpathSync(target) : fs.realpathSync(path.dirname(target));
  if (parent !== root && !parent.startsWith(`${root}${path.sep}`)) {
    throw new Error(`workspace 밖의 경로는 사용할 수 없습니다: ${requested}`);
  }
  const relative = path.relative(root, target);
  if (write && (relative === ".git" || relative.startsWith(`.git${path.sep}`))) {
    throw new Error(".git metadata는 write tool로 수정할 수 없습니다.");
  }
  return target;
}

function repositoryFiles(cwd, prefix = ".") {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const normalizedPrefix = prefix === "." ? "" : prefix.replace(/\\/g, "/").replace(/^\.\//, "");
  return String(result.stdout || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !normalizedPrefix || item.startsWith(normalizedPrefix))
    .slice(0, 500);
}

function searchWorkspace(cwd, query, prefix = ".") {
  const needle = String(query || "").toLowerCase();
  if (!needle) throw new Error("search query가 비어 있습니다.");
  const matches = [];
  for (const relative of repositoryFiles(cwd, prefix)) {
    if (matches.length >= 120) break;
    const target = safeWorkspacePath(cwd, relative);
    let stat;
    try { stat = fs.statSync(target); } catch { continue; }
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
    let text;
    try { text = fs.readFileSync(target, "utf8"); } catch { continue; }
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].toLowerCase().includes(needle)) {
        matches.push(`${relative}:${index + 1}:${lines[index]}`);
        if (matches.length >= 120) break;
      }
    }
  }
  return matches.join("\n") || "No matches.";
}

function runAllowedProgram(cwd, program, args) {
  if (!ALLOWED_PROGRAMS.has(program)) throw new Error(`허용되지 않은 program입니다: ${program}`);
  const safeArgs = Array.isArray(args) ? args.map((value) => String(value)) : [];
  if (program === "gh" && safeArgs[0] && !SAFE_GH_ROOTS.has(safeArgs[0])) {
    throw new Error("Local Agent의 gh tool은 PR 명령만 허용합니다.");
  }
  const timeout = envNumber("BLOOM_LOCAL_TOOL_TIMEOUT_MS", 10 * 60 * 1000, 1000);
  const output = spawnSync(program, safeArgs, {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  const combined = [output.stdout, output.stderr].filter(Boolean).join("\n");
  return {
    ok: output.status === 0,
    exitCode: output.status,
    output: truncate(combined),
    error: output.error ? String(output.error.message || output.error) : null,
  };
}

function executeTool(cwd, action) {
  switch (action.action) {
    case "list":
      return { ok: true, files: repositoryFiles(cwd, String(action.path || ".")) };
    case "read": {
      const target = safeWorkspacePath(cwd, String(action.path || ""));
      const stat = fs.statSync(target);
      if (!stat.isFile()) throw new Error("read path가 파일이 아닙니다.");
      if (stat.size > MAX_FILE_BYTES) throw new Error("read 파일이 256KB 제한을 초과했습니다.");
      const lines = fs.readFileSync(target, "utf8").split("\n");
      const start = Math.max(1, Number(action.startLine) || 1);
      const end = Math.min(lines.length, Number(action.endLine) || start + 239);
      return { ok: true, path: action.path, startLine: start, endLine: end, content: lines.slice(start - 1, end).join("\n") };
    }
    case "search":
      return { ok: true, matches: searchWorkspace(cwd, String(action.query || ""), String(action.path || ".")) };
    case "write": {
      const target = safeWorkspacePath(cwd, String(action.path || ""), { write: true });
      const content = String(action.content ?? "");
      if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("write content가 256KB 제한을 초과했습니다.");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
      return { ok: true, path: action.path, bytes: Buffer.byteLength(content, "utf8") };
    }
    case "run":
      return runAllowedProgram(cwd, String(action.program || ""), action.args);
    default:
      throw new Error(`알 수 없는 Local Agent tool action입니다: ${action.action}`);
  }
}

function normalizeReport(raw) {
  const report = raw && typeof raw === "object" ? raw : {};
  const status = report.status === "completed" ? "completed" : "blocked";
  const strings = (value, max = 30) => Array.isArray(value)
    ? value.slice(0, max).map((item) => String(item)).filter(Boolean)
    : [];
  const verification = Array.isArray(report.verification)
    ? report.verification.slice(0, 30).map((item) => ({
      name: String(item?.name || "verification"),
      status: ["passed", "failed", "blocked", "not-run"].includes(item?.status) ? item.status : "not-run",
      details: String(item?.details || ""),
    }))
    : [];
  return {
    status,
    summary: String(report.summary || (status === "completed" ? "Task completed." : "Task blocked.")),
    rationaleSummary: String(report.rationaleSummary || "Local Agent result based on available repository evidence."),
    evidence: strings(report.evidence),
    verification,
    commitSha: typeof report.commitSha === "string" ? report.commitSha : null,
    pullRequestNumber: Number.isInteger(report.pullRequestNumber) && report.pullRequestNumber > 0 ? report.pullRequestNumber : null,
    pullRequestUrl: typeof report.pullRequestUrl === "string" ? report.pullRequestUrl : null,
    reviewedPullRequests: Array.isArray(report.reviewedPullRequests)
      ? report.reviewedPullRequests.filter((value) => Number.isInteger(value) && value > 0).slice(0, 30)
      : [],
    blockers: strings(report.blockers, 20),
  };
}

function currentBranch(cwd) {
  const result = runAllowedProgram(cwd, "git", ["branch", "--show-current"]);
  return result.ok ? result.output.trim() : "";
}

function ensureRepositoryDelivery(cwd, title, report) {
  if (report.status !== "completed") return report;
  const branch = currentBranch(cwd);
  if (!branch || branch === "main" || branch === "develop") return report;

  const status = runAllowedProgram(cwd, "git", ["status", "--porcelain"]);
  if (!status.ok) throw new Error(`git status 실패: ${status.output}`);
  if (status.output.trim()) {
    const add = runAllowedProgram(cwd, "git", ["add", "-A"]);
    if (!add.ok) throw new Error(`git add 실패: ${add.output}`);
    const slug = branch.split("/").pop() || "agent-task";
    const commit = runAllowedProgram(cwd, "git", [
      "-c", "user.name=Bloom Local Agent",
      "-c", "user.email=bloom-local-agent@localhost",
      "commit", "-m", `feat: complete ${slug}`,
    ]);
    if (!commit.ok) throw new Error(`git commit 실패: ${commit.output}`);
  }

  const push = runAllowedProgram(cwd, "git", ["push", "-u", "origin", branch]);
  if (!push.ok) throw new Error(`git push 실패: ${push.output}`);

  const list = runAllowedProgram(cwd, "gh", [
    "pr", "list", "--head", branch, "--base", "develop", "--state", "open",
    "--limit", "1", "--json", "number,url",
  ]);
  if (!list.ok) throw new Error(`gh pr list 실패: ${list.output}`);
  let prs = [];
  try { prs = JSON.parse(list.output || "[]"); } catch { /* create below */ }
  if (!prs[0]) {
    const taskTitle = String(title || "Agent task").replace(/^[A-Z]+-\d+:\s*/, "").trim() || "Agent task";
    const body = [
      "# ✨ PR 내용",
      "",
      "## 📝 코드 변경 사항",
      "- Bloom Local Agent가 할당된 Task를 구현했습니다.",
      "",
      "## 💡 변경 이유",
      "- PM Task와 acceptance criteria를 충족하기 위한 변경입니다.",
      "",
      "## 🛠️ 구현 방법",
      "- repository evidence를 확인하고 필요한 코드를 수정했습니다.",
      "",
      "## 📌 영향 범위",
      "- 해당 Agent Task 범위",
      "",
      "## ✅ 테스트",
      "- Agent report의 verification evidence를 확인해 주세요.",
      "",
      "**테스트 결과 / 참고 사항**",
      "- 자동 생성 PR이며 독립 Code Review/Reviewer/QA gate를 통과해야 합니다.",
      "",
      "## 🌿 반영 브랜치",
      "- develop",
    ].join("\n");
    const created = runAllowedProgram(cwd, "gh", [
      "pr", "create", "--base", "develop", "--head", branch,
      "--title", `feat : ${taskTitle}`, "--body", body,
    ]);
    if (!created.ok) throw new Error(`gh pr create 실패: ${created.output}`);
    const refresh = runAllowedProgram(cwd, "gh", [
      "pr", "list", "--head", branch, "--base", "develop", "--state", "open",
      "--limit", "1", "--json", "number,url",
    ]);
    if (refresh.ok) {
      try { prs = JSON.parse(refresh.output || "[]"); } catch { /* validated later by Rust */ }
    }
  }

  const head = runAllowedProgram(cwd, "git", ["rev-parse", "HEAD"]);
  if (head.ok) report.commitSha = head.output.trim();
  if (prs[0]) {
    report.pullRequestNumber = prs[0].number || null;
    report.pullRequestUrl = prs[0].url || null;
  }
  return report;
}

function agentSystemPrompt(schema) {
  return [
    "You are Bloom Local Agent Runtime. You operate one senior software-agent identity at a time.",
    "Work deliberately: inspect repository evidence first, make the smallest defensible changes, verify them, and never fabricate results.",
    "You have a JSON action protocol. Reply with exactly ONE JSON object per turn and no Markdown.",
    "Available actions:",
    '{"action":"list","path":"."}',
    '{"action":"read","path":"relative/file","startLine":1,"endLine":240}',
    '{"action":"search","query":"text","path":"."}',
    '{"action":"write","path":"relative/file","content":"complete file content"}',
    '{"action":"run","program":"git|gh|pnpm|npm|npx|node|python3|cargo|dotnet|java|javac|mvn|gradle","args":["..."]}',
    '{"action":"final","report":{...}}',
    "Do not use final until the acceptance criteria have been implemented or a concrete blocker is proven.",
    "For repository-changing tasks, edit and verify files; the runtime will ensure the final commit, push, and PR if needed.",
    "For review tasks, inspect dependency PR evidence and use gh pr diff/view/comment when needed.",
    `Final report schema: ${JSON.stringify(schema || {})}`,
  ].join("\n");
}

async function runAgentLoop(cwd, prompt, schema, title) {
  const system = agentSystemPrompt(schema);
  const history = [{ role: "user", content: prompt }];
  const maxTurns = envNumber("BLOOM_LOCAL_MAX_TOOL_TURNS", DEFAULT_MAX_TOOL_TURNS, 4);

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const boundedHistory = history.length <= 10
      ? history
      : [history[0], ...history.slice(-9)];
    const response = await callLocalModel([{ role: "system", content: system }, ...boundedHistory], {
      maxTokens: envNumber("BLOOM_LOCAL_AGENT_MAX_TOKENS", 1536, 256),
    });
    let action;
    try {
      action = parseJsonObject(response.content);
    } catch (error) {
      history.push({ role: "assistant", content: response.content });
      history.push({ role: "user", content: `FORMAT ERROR: ${error.message}. Return exactly one valid JSON action object.` });
      continue;
    }

    if (action.action === "final") {
      let report = normalizeReport(action.report);
      if (prompt.includes("repository-changing worker")) {
        try {
          report = ensureRepositoryDelivery(cwd, title, report);
        } catch (error) {
          report.status = "blocked";
          report.blockers = Array.from(new Set([...report.blockers, `delivery finalization failed: ${error.message}`]));
          report.rationaleSummary = `${report.rationaleSummary} Delivery automation could not safely finish.`;
        }
      }
      return report;
    }

    let toolResult;
    try {
      toolResult = executeTool(cwd, action);
    } catch (error) {
      toolResult = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    history.push({ role: "assistant", content: JSON.stringify(action) });
    history.push({ role: "user", content: `TOOL RESULT:\n${truncate(JSON.stringify(toolResult))}` });
  }

  return normalizeReport({
    status: "blocked",
    summary: "Local Agent tool-loop turn limit reached.",
    rationaleSummary: "The task was stopped to protect server resources and prevent an unbounded local-model loop.",
    blockers: [`Local Agent exceeded ${maxTurns} tool turns.`],
    verification: [],
    evidence: [],
  });
}

function parseFlag(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

async function readStdinAll() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function runExec(args) {
  const schemaPath = parseFlag(args, "--output-schema");
  const outputPath = parseFlag(args, "--output-last-message");
  const cwdFlag = parseFlag(args, "-C");
  const prompt = await readStdinAll();
  const schemaText = schemaPath && fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, "utf8") : "";
  const id = sessionId("local-exec");
  const result = await withLocalSession(() => completeJson(prompt, schemaText));
  const normalized = JSON.stringify(result.value);
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, normalized, "utf8");
  }
  process.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: id, cwd: cwdFlag || process.cwd(), engine: "local-llm" })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "turn.completed", session_id: id, model: result.model })}\n`);
}

function writeProtocol(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function runAppServer() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let threadId = sessionId("local-thread");
  for await (const line of rl) {
    if (!line.trim()) continue;
    let request;
    try { request = JSON.parse(line); } catch { continue; }
    if (request.method === "initialize") {
      writeProtocol({ id: request.id, result: { engine: "bloom-local-llm", capabilities: {} } });
      continue;
    }
    if (request.method === "initialized") continue;
    if (request.method === "thread/start") {
      threadId = sessionId("local-thread");
      writeProtocol({ id: request.id, result: { thread: { id: threadId } } });
      continue;
    }
    if (request.method !== "turn/start") continue;

    const turnId = sessionId("local-turn");
    writeProtocol({ id: request.id, result: { turn: { id: turnId } } });
    const params = request.params || {};
    const cwd = path.resolve(String(params.cwd || process.cwd()));
    const prompt = Array.isArray(params.input)
      ? params.input.map((item) => item?.text || "").join("\n")
      : "";
    try {
      const report = await withLocalSession(() => runAgentLoop(cwd, prompt, params.outputSchema, params.title));
      writeProtocol({
        method: "item/completed",
        params: { item: { type: "agentMessage", text: JSON.stringify(report) } },
      });
      writeProtocol({
        method: "turn/completed",
        params: { turn: { id: turnId, status: "completed", error: null, threadId } },
      });
    } catch (error) {
      writeProtocol({
        method: "turn/completed",
        params: { turn: { id: turnId, status: "failed", error: { message: error instanceof Error ? error.message : String(error) }, threadId } },
      });
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--version")) {
    process.stdout.write("bloom-local-agent-runtime 1.0.0\n");
    return;
  }
  if (args[0] === "login" && args[1] === "status") {
    process.stdout.write("chatgpt compatibility: bloom local-llm; no external login required\n");
    return;
  }
  if (args[0] === "login") {
    process.stdout.write("Bloom local-llm runtime does not require an external model login.\n");
    return;
  }
  if (args[0] === "exec") {
    await runExec(args.slice(1));
    return;
  }
  if (args[0] === "app-server") {
    await runAppServer();
    return;
  }
  throw new Error(`Unsupported Bloom local compatibility command: ${args.join(" ")}`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[bloom-local] ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  callLocalModel,
  completeJson,
  localResourceSnapshot,
  normalizeReport,
  parseJsonObject,
  runAgentLoop,
  waitForResources,
};
