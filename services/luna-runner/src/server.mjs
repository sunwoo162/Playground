import { createServer } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const host = process.env.LUNA_RUNNER_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.LUNA_RUNNER_PORT || "4781");
const token = process.env.LUNA_RUNNER_TOKEN?.trim() || "";
const dataDir = resolve(process.env.LUNA_RUNNER_DATA_DIR?.trim() || ".luna-runner");
const workerExecutable = process.env.LUNA_RUNNER_WORKER?.trim() || "";
const jobsFile = join(dataDir, "jobs.json");
const jobDir = join(dataDir, "jobs");
const maxBodyBytes = 1024 * 1024;

if (!token) {
  throw new Error("LUNA_RUNNER_TOKEN is required.");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("LUNA_RUNNER_PORT must be a valid TCP port.");
}

const state = {
  jobs: [],
  activeJobId: null,
  processing: false,
};

function now() {
  return new Date().toISOString();
}

function tokenDigest(value) {
  return createHash("sha256").update(value).digest();
}

const expectedTokenDigest = tokenDigest(token);

function authorized(request) {
  const header = request.headers.authorization || "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const presented = header.slice(prefix.length).trim();
  const digest = tokenDigest(presented);
  return digest.length === expectedTokenDigest.length && timingSafeEqual(digest, expectedTokenDigest);
}

function json(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
}

function publicJob(job) {
  return {
    id: job.id,
    idempotencyKey: job.idempotencyKey,
    projectId: job.projectId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    attempt: job.attempt,
    error: job.error,
    result: job.result,
  };
}

async function readJsonBody(request) {
  let total = 0;
  const chunks = [];
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new Error("request body exceeds 1MB limit");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text);
}

async function persistJobs() {
  await mkdir(dirname(jobsFile), { recursive: true });
  const temporary = `${jobsFile}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, jobs: state.jobs }, null, 2), "utf8");
  await rename(temporary, jobsFile);
}

async function loadJobs() {
  await mkdir(jobDir, { recursive: true });
  try {
    const raw = await readFile(jobsFile, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.jobs)) return;
    state.jobs = parsed.jobs.map((job) => {
      if (job.status === "running") {
        return {
          ...job,
          status: "queued",
          updatedAt: now(),
          error: "Runner restarted while this job was running; job was re-queued for reconciliation.",
        };
      }
      return job;
    });
    await persistJobs();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function validateCreateJob(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("job body must be a JSON object");
  }
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  if (!projectId || projectId.length > 120) {
    throw new Error("projectId is required and must be <= 120 characters");
  }
  const idempotencyKey = typeof input.idempotencyKey === "string"
    ? input.idempotencyKey.trim()
    : "";
  if (!idempotencyKey || idempotencyKey.length > 160) {
    throw new Error("idempotencyKey is required and must be <= 160 characters");
  }
  if (!("payload" in input) || input.payload === undefined) {
    throw new Error("payload is required");
  }
  return { projectId, idempotencyKey, payload: input.payload };
}

async function writeWorkerInput(job) {
  const path = join(jobDir, `${job.id}.input.json`);
  await writeFile(
    path,
    JSON.stringify(
      {
        protocolVersion: 1,
        jobId: job.id,
        projectId: job.projectId,
        payload: job.payload,
      },
      null,
      2,
    ),
    "utf8",
  );
  return path;
}

async function executeWorker(job) {
  if (!workerExecutable) {
    throw new Error("LUNA_RUNNER_WORKER is not configured");
  }

  const inputPath = await writeWorkerInput(job);
  const resultPath = join(jobDir, `${job.id}.result.json`);
  const logPath = join(jobDir, `${job.id}.log.txt`);

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(workerExecutable, [
      "--input",
      inputPath,
      "--output",
      resultPath,
    ], {
      cwd: dataDir,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const logs = [];
    child.stdout.on("data", (chunk) => logs.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => logs.push(Buffer.from(chunk)));

    child.once("error", rejectPromise);
    child.once("exit", async (code, signal) => {
      try {
        await writeFile(logPath, Buffer.concat(logs));
      } catch {
        // Preserve worker exit result even when log persistence fails.
      }
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`worker exited with code=${code ?? "null"} signal=${signal ?? "none"}`));
      }
    });
  });

  const resultRaw = await readFile(resultPath, "utf8");
  return JSON.parse(resultRaw);
}

async function processQueue() {
  if (state.processing) return;
  state.processing = true;

  try {
    while (true) {
      const job = state.jobs.find((item) => item.status === "queued");
      if (!job) break;

      job.status = "running";
      job.startedAt = now();
      job.updatedAt = job.startedAt;
      job.attempt = (job.attempt || 0) + 1;
      job.error = null;
      state.activeJobId = job.id;
      await persistJobs();

      try {
        job.result = await executeWorker(job);
        job.status = "succeeded";
        job.error = null;
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : String(error);
      } finally {
        job.completedAt = now();
        job.updatedAt = job.completedAt;
        state.activeJobId = null;
        await persistJobs();
      }
    }
  } finally {
    state.processing = false;
  }
}

async function createJob(input) {
  const validated = validateCreateJob(input);
  const existing = state.jobs.find(
    (job) => job.idempotencyKey === validated.idempotencyKey,
  );
  if (existing) return { job: existing, created: false };

  const timestamp = now();
  const job = {
    id: randomUUID(),
    idempotencyKey: validated.idempotencyKey,
    projectId: validated.projectId,
    payload: validated.payload,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null,
    attempt: 0,
    error: null,
    result: null,
  };
  state.jobs.push(job);
  await persistJobs();
  queueMicrotask(() => {
    void processQueue();
  });
  return { job, created: true };
}

function routePath(request) {
  return new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
}

const server = createServer(async (request, response) => {
  try {
    const path = routePath(request);

    if (path === "/health" && request.method === "GET") {
      return json(response, 200, {
        ok: true,
        service: "luna-runner",
        protocolVersion: 1,
        workerConfigured: Boolean(workerExecutable),
        activeJobId: state.activeJobId,
        queuedJobs: state.jobs.filter((job) => job.status === "queued").length,
      });
    }

    if (!authorized(request)) {
      return json(response, 401, { error: "unauthorized" });
    }

    if (path === "/v1/jobs" && request.method === "POST") {
      const body = await readJsonBody(request);
      const { job, created } = await createJob(body);
      return json(response, created ? 202 : 200, publicJob(job));
    }

    if (path === "/v1/jobs" && request.method === "GET") {
      return json(response, 200, {
        jobs: state.jobs.map(publicJob),
      });
    }

    const match = path.match(/^\/v1\/jobs\/([0-9a-f-]+)$/i);
    if (match && request.method === "GET") {
      const job = state.jobs.find((item) => item.id === match[1]);
      if (!job) return json(response, 404, { error: "job_not_found" });
      return json(response, 200, publicJob(job));
    }

    const cancelMatch = path.match(/^\/v1\/jobs\/([0-9a-f-]+)\/cancel$/i);
    if (cancelMatch && request.method === "POST") {
      const job = state.jobs.find((item) => item.id === cancelMatch[1]);
      if (!job) return json(response, 404, { error: "job_not_found" });
      if (job.status === "running") {
        return json(response, 409, {
          error: "job_running",
          message: "Running jobs are not force-killed. Worker-level cooperative cancellation is required.",
        });
      }
      if (job.status !== "queued") {
        return json(response, 409, { error: "job_not_queued" });
      }
      job.status = "cancelled";
      job.updatedAt = now();
      job.completedAt = job.updatedAt;
      await persistJobs();
      return json(response, 200, publicJob(job));
    }

    return json(response, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(response, 400, { error: "bad_request", message });
  }
});

await loadJobs();
server.listen(port, host, () => {
  console.log(`Luna Runner listening on http://${host}:${port}`);
  console.log(`Data directory: ${dataDir}`);
  console.log(`Worker configured: ${workerExecutable ? "yes" : "no"}`);
  void processQueue();
});
