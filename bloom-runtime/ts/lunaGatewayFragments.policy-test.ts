import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  activateLunaGatewayRouteFragment,
  rollbackLunaGatewayRouteFragment,
} from "./lunaGatewayFragments";
import type { LunaGatewayRoute } from "./lunaGateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function run() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "luna-gateway-fragments-"));
  try {
    const alpha: LunaGatewayRoute = {
      slug: "alpha-web",
      runtimeId: "web",
      type: "static",
      routingMode: "spa",
      releaseRoot: "/srv/bloombouquet/apps/alpha-web",
    };
    const beta: LunaGatewayRoute = {
      slug: "beta-api",
      runtimeId: "web",
      type: "server",
      routingMode: "strip-prefix",
      activePort: 22000,
    };
    const validate = async () => undefined;
    const reload = async () => undefined;

    const alphaActivation = await activateLunaGatewayRouteFragment({
      route: alpha,
      routesDirectory: temp,
      validateCandidateImpl: validate,
      validateActiveImpl: validate,
      reloadImpl: reload,
    });
    const alphaBeforeBeta = await fs.readFile(alphaActivation.routePath, "utf8");

    const betaActivation = await activateLunaGatewayRouteFragment({
      route: beta,
      routesDirectory: temp,
      validateCandidateImpl: validate,
      validateActiveImpl: validate,
      reloadImpl: reload,
    });

    assert(
      await fs.readFile(alphaActivation.routePath, "utf8") === alphaBeforeBeta,
      "activating a new Luna app must preserve existing app fragments",
    );
    assert(
      (await fs.readFile(betaActivation.routePath, "utf8")).includes("127.0.0.1:22000"),
      "the new server fragment must point at its selected candidate port",
    );

    const alphaServerActivation = await activateLunaGatewayRouteFragment({
      route: {
        slug: "alpha-web",
        runtimeId: "web",
        type: "server",
        routingMode: "preserve-prefix",
        activePort: 22002,
      },
      routesDirectory: temp,
      validateCandidateImpl: validate,
      validateActiveImpl: validate,
      reloadImpl: reload,
    });
    assert(alphaServerActivation.previousConfig === alphaBeforeBeta, "updating one slug must capture its previous route for rollback");
    assert((await fs.readFile(betaActivation.routePath, "utf8")).includes("127.0.0.1:22000"), "updating alpha must not rewrite beta");

    await rollbackLunaGatewayRouteFragment({
      activation: alphaServerActivation,
      validateActiveImpl: validate,
      reloadImpl: reload,
    });
    assert(await fs.readFile(alphaActivation.routePath, "utf8") === alphaBeforeBeta, "rollback must restore only the changed slug fragment");
    assert(await exists(betaActivation.routePath), "rollback of one app must preserve other app routes");

    let reloadCount = 0;
    let failed = false;
    try {
      await activateLunaGatewayRouteFragment({
        route: {
          slug: "gamma-web",
          runtimeId: "web",
          type: "static",
          routingMode: "static-files",
          releaseRoot: "/srv/bloombouquet/apps/gamma-web",
        },
        routesDirectory: temp,
        validateCandidateImpl: validate,
        validateActiveImpl: validate,
        reloadImpl: async () => {
          reloadCount += 1;
          throw new Error("reload failed");
        },
      });
    } catch (error) {
      failed = error instanceof Error && /reload failed/i.test(error.message);
    }
    assert(failed, "fragment reload failure must surface to the delivery controller");
    assert(!(await exists(path.join(temp, "gamma-web.conf"))), "failed first activation must remove the new fragment during rollback");
    assert(reloadCount >= 1, "activation must attempt an Nginx reload");

    console.log("PASS  Luna per-project gateway fragment scenarios passed.");
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
