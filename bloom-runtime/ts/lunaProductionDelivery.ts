import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as path from "node:path";

import { automateLunaDelivery } from "./lunaDeliveryAutomation";
import { writeLunaReviewPackage } from "./lunaReviewPackage";
import {
  runDeliveryBuild,
  type LunaDeliveryBuildResult,
  type LunaDeliveryBuildRuntimeResult,
} from "./lunaDeliveryBuild";
import {
  verifyLocalHealth,
  verifyPublicDocument,
} from "./lunaDeliveryHealth";
import {
  createLunaDeliveryHttpClient,
  type LunaDeliveryHttpClient,
  type LunaDeliveryRuntimeState,
} from "./lunaDeliveryHttpClient";
import {
  loadLunaDeliveryManifest,
  type LunaDeliveryManifest,
  type LunaDeliveryRuntimeManifest,
  type LunaServerRoutingMode,
  type LunaStaticRoutingMode,
} from "./lunaDeliveryManifest";
import {
  activateLunaGatewayRouteFragment,
  rollbackLunaGatewayRouteFragment,
  type LunaGatewayFragmentActivation,
} from "./lunaGatewayFragments";
import {
  chooseCandidateSlot,
  startServerCandidate,
  type LunaServerCandidateResult,
  type LunaServerSlot,
} from "./lunaServerRuntime";
import {
  installServerCandidateRelease,
  type LunaServerReleaseLocation,
} from "./lunaServerRelease";
import {
  activateStaticRelease,
  installStaticCandidate,
  rollbackStaticRelease,
  type LunaStaticActivationResult,
  type LunaStaticReleaseLocation,
} from "./lunaStaticRelease";
import type { LunaIntegratedDeliveryHook } from "./observedHeadlessBuilderExecutor";

const CANONICAL_ORIGIN = "https://bloombouquet.https.gsmsv.site";
const DEFAULT_APPS_ROOT = "/srv/bloombouquet/apps";
const DEFAULT_ROUTES_DIRECTORY = "/etc/nginx/bloombouquet-apps.d";
const DEFAULT_RUNTIME_ENVIRONMENT_ROOT = "/srv/bloombouquet/runtime-env";
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

type StaticCandidate = {
  kind: "static";
  runtime: LunaDeliveryRuntimeManifest;
  buildRuntime: LunaDeliveryBuildRuntimeResult;
  location: LunaStaticReleaseLocation;
  activation: LunaStaticActivationResult | null;
};

type ServerCandidate = {
  kind: "server";
  runtime: LunaDeliveryRuntimeManifest;
  buildRuntime: LunaDeliveryBuildRuntimeResult;
  runtimeState: LunaDeliveryRuntimeState;
  previousActiveSlot: LunaServerSlot | null;
  candidateSlot: LunaServerSlot;
  port: number;
  release: LunaServerReleaseLocation;
  service: LunaServerCandidateResult;
};

type ProductionCandidate = StaticCandidate | ServerCandidate;

type ProductionGateway = {
  fragment: LunaGatewayFragmentActivation;
};

export type LunaProductionDeliveryOptions = {
  baseUrl: string;
  token: string;
  teamId: string;
  teamName: string;
  env?: Record<string, string | undefined>;
  appsRoot?: string;
  routesDirectory?: string;
  runtimeEnvironmentRoot?: string;
};

function requireSingleRuntime(manifest: LunaDeliveryManifest) {
  if (manifest.runtimes.length !== 1) {
    throw new Error(
      "Production Luna delivery currently requires exactly one public runtime per /apps/<slug>/ route.",
    );
  }
  return manifest.runtimes[0]!;
}

function requiredBuildRuntime(
  build: LunaDeliveryBuildResult,
  runtimeId: string,
) {
  const runtime = build.runtimes.find((item) => item.runtimeId === runtimeId);
  if (!runtime) throw new Error(`Built Luna runtime is missing: ${runtimeId}`);
  return runtime;
}

function selectedEnvironment(
  manifest: LunaDeliveryManifest,
  source: Record<string, string | undefined>,
) {
  return Object.fromEntries(
    manifest.env.required.map((name) => [name, source[name]]),
  );
}

function normalizeSlot(value: string | null): LunaServerSlot | null {
  if (value === null) return null;
  if (value !== "A" && value !== "B") {
    throw new Error(`Registry returned an invalid Luna active slot: ${value}`);
  }
  return value;
}

function requiredPort(runtime: LunaDeliveryRuntimeState, slot: LunaServerSlot) {
  const port = slot === "A" ? runtime.slotAPort : runtime.slotBPort;
  if (!Number.isInteger(port) || (port as number) < 1024 || (port as number) > 65535) {
    throw new Error(`Registry did not allocate a valid Luna ${slot} slot port.`);
  }
  return port as number;
}

function staticRoutingMode(runtime: LunaDeliveryRuntimeManifest): LunaStaticRoutingMode {
  if (runtime.routingMode !== "static-files" && runtime.routingMode !== "spa") {
    throw new Error("Static Luna runtime has an invalid routing mode.");
  }
  return runtime.routingMode;
}

function serverRoutingMode(runtime: LunaDeliveryRuntimeManifest): LunaServerRoutingMode {
  if (runtime.routingMode !== "strip-prefix" && runtime.routingMode !== "preserve-prefix") {
    throw new Error("Server Luna runtime has an invalid routing mode.");
  }
  return runtime.routingMode;
}

async function runProcess(command: string, args: string[], allowFailure = false) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: "inherit" });
    child.once("error", (error) => allowFailure ? resolve() : reject(error));
    child.once("exit", (code, signal) => {
      if (code === 0 || allowFailure) {
        resolve();
        return;
      }
      reject(new Error(
        signal
          ? `${command} terminated by signal ${signal}.`
          : `${command} failed with exit code ${code ?? "unknown"}.`,
      ));
    });
  });
}

async function privilegedSystemctl(command: string, args: string[]) {
  if (command !== "systemctl") {
    throw new Error(`Unexpected privileged Luna runtime command: ${command}`);
  }
  await runProcess("sudo", ["-n", "systemctl", ...args]);
}

async function stopManagedService(serviceName: string) {
  await runProcess("sudo", ["-n", "systemctl", "stop", serviceName], true);
}

function serviceName(slug: string, runtimeId: string, slot: LunaServerSlot) {
  return `bloombouquet-luna-app@${slug}-${runtimeId}-${slot}.service`;
}

function isInside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function serveStaticCandidate(
  releasePath: string,
  routingMode: LunaStaticRoutingMode,
  run: (port: number) => Promise<void>,
) {
  const root = await fs.realpath(releasePath);
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const decoded = decodeURIComponent(requestUrl.pathname);
      const relative = decoded.replace(/^\/+/, "");
      let target = path.resolve(root, relative || "index.html");
      if (!isInside(root, target)) {
        response.statusCode = 403;
        response.end("forbidden");
        return;
      }

      try {
        const stat = await fs.stat(target);
        if (stat.isDirectory()) target = path.join(target, "index.html");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      let body: Buffer;
      try {
        body = await fs.readFile(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" || routingMode !== "spa") {
          response.statusCode = 404;
          response.end("not found");
          return;
        }
        body = await fs.readFile(path.join(root, "index.html"));
      }
      response.statusCode = 200;
      response.end(body);
    } catch {
      response.statusCode = 500;
      response.end("error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Luna static candidate did not expose a local validation port.");
    }
    await run(address.port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function repositoryUrl(repositoryFullName: string) {
  if (!REPOSITORY_PATTERN.test(repositoryFullName)) {
    throw new Error("Luna delivery repository identity is invalid.");
  }
  return `https://github.com/${repositoryFullName}`;
}

function authCallbackUrl(slug: string) {
  return `${CANONICAL_ORIGIN}/apps/${slug}/auth/bouquet/callback`;
}

export function createLunaProductionDeliveryHook(
  options: LunaProductionDeliveryOptions,
): LunaIntegratedDeliveryHook {
  const client: LunaDeliveryHttpClient = createLunaDeliveryHttpClient({
    baseUrl: options.baseUrl,
    token: options.token,
  });
  const environmentSource = options.env ?? process.env;
  const appsRoot = options.appsRoot ?? DEFAULT_APPS_ROOT;
  const routesDirectory = options.routesDirectory ?? DEFAULT_ROUTES_DIRECTORY;
  const runtimeEnvironmentRoot = options.runtimeEnvironmentRoot ?? DEFAULT_RUNTIME_ENVIRONMENT_ROOT;

  return async (input) => {
    let manifest: LunaDeliveryManifest | null = null;
    let runtimeState: LunaDeliveryRuntimeState | null = null;
    let runtimeEnvironment: Record<string, string | undefined> = {};

    const dependencies = {
      async build() {
        manifest = await loadLunaDeliveryManifest(input.workspacePath);
        if (manifest.slug !== input.slug) {
          throw new Error("Luna delivery manifest slug does not match the promoted project slug.");
        }
        const runtime = requireSingleRuntime(manifest);
        runtimeEnvironment = selectedEnvironment(manifest, environmentSource);

        const detail = await client.getProject(input.slug);
        const existing = detail.runtimes.find((item) => item.runtimeId === runtime.id) ?? null;
        runtimeState = await client.upsertRuntime(input.slug, runtime.id, {
          runtimeType: runtime.type,
          slotAPort: runtime.type === "server" ? existing?.slotAPort ?? null : null,
          slotBPort: runtime.type === "server" ? existing?.slotBPort ?? null : null,
          activeSlot: existing?.activeSlot ?? null,
          candidateSlot: null,
        });

        return runDeliveryBuild({
          workspacePath: input.workspacePath,
          manifest,
          slug: input.slug,
          gitSha: input.mainSha,
          env: runtimeEnvironment,
        });
      },

      async installCandidate(build: LunaDeliveryBuildResult): Promise<ProductionCandidate> {
        if (!manifest || !runtimeState) {
          throw new Error("Luna production delivery build evidence is incomplete.");
        }
        const runtime = requireSingleRuntime(manifest);
        const built = requiredBuildRuntime(build, runtime.id);

        if (runtime.type === "static") {
          if (!built.outputPath) {
            throw new Error(`Static Luna runtime ${runtime.id} has no build output path.`);
          }
          const location = await installStaticCandidate({
            slug: input.slug,
            sha: input.mainSha,
            outputPath: built.outputPath,
            appsRoot,
          });
          return {
            kind: "static",
            runtime,
            buildRuntime: built,
            location,
            activation: null,
          };
        }

        const previousActiveSlot = normalizeSlot(runtimeState.activeSlot);
        const candidateSlot = chooseCandidateSlot(previousActiveSlot);
        const port = requiredPort(runtimeState, candidateSlot);
        const startCommand = built.startCommand?.trim() ?? "";
        if (!startCommand) {
          throw new Error(`Server Luna runtime ${runtime.id} has no start command.`);
        }
        const release = await installServerCandidateRelease({
          slug: input.slug,
          runtimeId: runtime.id,
          sha: input.mainSha,
          sourcePath: built.workingDirectory,
          appsRoot,
        });

        runtimeState = await client.upsertRuntime(input.slug, runtime.id, {
          runtimeType: "server",
          slotAPort: runtimeState.slotAPort,
          slotBPort: runtimeState.slotBPort,
          activeSlot: previousActiveSlot,
          candidateSlot,
        });

        await stopManagedService(serviceName(input.slug, runtime.id, candidateSlot));
        const service = await startServerCandidate({
          slug: input.slug,
          runtimeId: runtime.id,
          slot: candidateSlot,
          port,
          releasePath: release.releasePath,
          dataDirectory: path.join(appsRoot, input.slug, "data"),
          startCommand,
          env: runtimeEnvironment,
          environmentRoot: runtimeEnvironmentRoot,
          spawnImpl: privilegedSystemctl,
        });

        return {
          kind: "server",
          runtime,
          buildRuntime: built,
          runtimeState,
          previousActiveSlot,
          candidateSlot,
          port,
          release,
          service,
        };
      },

      async verifyLocal(candidate: ProductionCandidate) {
        if (candidate.kind === "static") {
          await serveStaticCandidate(
            candidate.location.releasePath,
            staticRoutingMode(candidate.runtime),
            async (port) => {
              await verifyLocalHealth({
                port,
                healthPath: candidate.runtime.healthPath,
              });
            },
          );
          return;
        }
        await verifyLocalHealth({
          port: candidate.port,
          healthPath: candidate.runtime.healthPath,
        });
      },

      async activateGateway(candidate: ProductionCandidate): Promise<ProductionGateway> {
        if (candidate.kind === "static") {
          candidate.activation = await activateStaticRelease({
            slug: input.slug,
            sha: input.mainSha,
            appsRoot,
          });
          const fragment = await activateLunaGatewayRouteFragment({
            route: {
              slug: input.slug,
              runtimeId: candidate.runtime.id,
              type: "static",
              routingMode: staticRoutingMode(candidate.runtime),
              releaseRoot: candidate.location.appRoot,
            },
            routesDirectory,
          });
          return { fragment };
        }

        const fragment = await activateLunaGatewayRouteFragment({
          route: {
            slug: input.slug,
            runtimeId: candidate.runtime.id,
            type: "server",
            routingMode: serverRoutingMode(candidate.runtime),
            activePort: candidate.port,
          },
          routesDirectory,
        });
        return { fragment };
      },

      async verifyPublic(_gateway: ProductionGateway, candidate: ProductionCandidate) {
        await verifyPublicDocument({
          publicUrl: `${CANONICAL_ORIGIN}/apps/${input.slug}/`,
          healthPath: candidate.runtime.healthPath,
        });

        if (candidate.kind === "server") {
          runtimeState = await client.upsertRuntime(input.slug, candidate.runtime.id, {
            runtimeType: "server",
            slotAPort: candidate.runtimeState.slotAPort,
            slotBPort: candidate.runtimeState.slotBPort,
            activeSlot: candidate.candidateSlot,
            candidateSlot: null,
          });
        }
      },

      async rollbackGateway(gateway: ProductionGateway) {
        await rollbackLunaGatewayRouteFragment({ activation: gateway.fragment });
      },

      async rollbackCandidate(candidate: ProductionCandidate) {
        if (candidate.kind === "static") {
          if (!candidate.activation) return;
          if (candidate.activation.previousSha) {
            await rollbackStaticRelease({
              slug: input.slug,
              previousSha: candidate.activation.previousSha,
              appsRoot,
            });
          } else {
            await fs.rm(candidate.activation.currentPath, { force: true });
          }
          return;
        }

        await stopManagedService(candidate.service.serviceName);
        await client.upsertRuntime(input.slug, candidate.runtime.id, {
          runtimeType: "server",
          slotAPort: candidate.runtimeState.slotAPort,
          slotBPort: candidate.runtimeState.slotBPort,
          activeSlot: candidate.previousActiveSlot,
          candidateSlot: null,
        });
      },
    };

    const publicUrl = `${CANONICAL_ORIGIN}/apps/${input.slug}/`;
    const result = await automateLunaDelivery({
      slug: input.slug,
      gitSha: input.mainSha,
      workspacePath: input.workspacePath,
      repositoryFullName: input.repositoryFullName,
      registration: {
        schemaVersion: 1,
        teamId: options.teamId,
        teamName: options.teamName,
        projectName: input.projectName,
        projectSlug: input.slug,
        description: input.description,
        version: "pending-release-identity",
        demoUrl: publicUrl,
        repositoryUrl: repositoryUrl(input.repositoryFullName),
        requiresAuth: input.requiresAuth,
        authRedirectUri: input.requiresAuth ? authCallbackUrl(input.slug) : null,
      },
      client,
      dependencies,
    });

    const reviewPackage = await writeLunaReviewPackage(input.workspacePath, {
      projectName: input.projectName,
      projectSlug: input.slug,
      repositoryFullName: input.repositoryFullName,
      commitSha: input.mainSha,
      publicUrl: result.delivery.publicUrl,
      requiresAuth: input.requiresAuth,
    });

    return {
      publicUrl: result.delivery.publicUrl,
      reviewPackagePath: reviewPackage.path,
    };
  };
}
