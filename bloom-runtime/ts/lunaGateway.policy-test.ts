import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  activateLunaGatewayConfig,
  renderLunaGatewayConfig,
  type LunaGatewayRoute,
} from "./lunaGateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => unknown, pattern: RegExp, message: string) {
  let error: unknown = null;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, message);
  assert(pattern.test(error.message), `${message}: ${error.message}`);
}

async function run() {
  const routes: LunaGatewayRoute[] = [
    {
      slug: "zeta-api",
      runtimeId: "web",
      type: "server",
      activePort: 3210,
    },
    {
      slug: "alpha-web",
      runtimeId: "web",
      type: "static",
      releaseRoot: "/srv/bloombouquet/apps/alpha-web",
    },
  ];

  const rendered = renderLunaGatewayConfig(routes);
  assert(rendered.includes("# MACHINE-OWNED: Luna generated app routes"), "generated gateway must identify the file as machine-owned");
  assert(rendered.indexOf("/apps/alpha-web/") < rendered.indexOf("/apps/zeta-api/"), "generated routes must be deterministic and sorted by slug/runtime");
  assert(rendered.includes("alias /srv/bloombouquet/apps/alpha-web/current/;"), "static routes must point at the active current release");
  assert(rendered.includes("proxy_pass http://127.0.0.1:3210/;"), "server routes must proxy to the Registry-selected active port and strip the public prefix");
  assert(rendered.includes("return 308 /apps/alpha-web/;"), "managed routes must canonicalize missing trailing slashes");

  assertThrows(
    () => renderLunaGatewayConfig([
      routes[0]!,
      { ...routes[0]!, runtimeId: "duplicate" },
    ]),
    /duplicate|slug/i,
    "one public slug must not render two competing managed routes",
  );

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "luna-gateway-"));
  try {
    const generatedConfigPath = path.join(temp, "bloombouquet-apps.generated.conf");
    await fs.writeFile(generatedConfigPath, "# previous\n", "utf8");
    const operations: string[] = [];

    await activateLunaGatewayConfig({
      routes,
      generatedConfigPath,
      validateCandidateImpl: async (candidatePath) => {
        operations.push("validate-candidate");
        const candidate = await fs.readFile(candidatePath, "utf8");
        assert(candidate === rendered, "candidate validation must inspect the exact rendered config before activation");
      },
      validateActiveImpl: async () => {
        operations.push("validate-active");
      },
      reloadImpl: async () => {
        operations.push("reload");
      },
    });

    assert(await fs.readFile(generatedConfigPath, "utf8") === rendered, "validated generated config must atomically become active");
    assert(operations.join(",") === "validate-candidate,validate-active,reload", "gateway activation must validate candidate, validate active config, then reload in order");

    await fs.writeFile(generatedConfigPath, "# healthy-previous\n", "utf8");
    let reloadFailed = false;
    try {
      await activateLunaGatewayConfig({
        routes,
        generatedConfigPath,
        validateCandidateImpl: async () => undefined,
        validateActiveImpl: async () => undefined,
        reloadImpl: async () => {
          throw new Error("reload failed");
        },
      });
    } catch (error) {
      reloadFailed = error instanceof Error && /reload failed/i.test(error.message);
    }
    assert(reloadFailed, "gateway reload failure must surface to the delivery controller");
    assert(await fs.readFile(generatedConfigPath, "utf8") === "# healthy-previous\n", "gateway reload failure must restore the previous generated include");

    console.log("PASS  Luna generated gateway scenarios passed.");
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
