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
      routingMode: "strip-prefix",
      activePort: 3210,
    },
    {
      slug: "alpha-web",
      runtimeId: "web",
      type: "static",
      routingMode: "static-files",
      releaseRoot: "/srv/bloombouquet/apps/alpha-web",
    },
    {
      slug: "spa-web",
      runtimeId: "web",
      type: "static",
      routingMode: "spa",
      releaseRoot: "/srv/bloombouquet/apps/spa-web",
    },
    {
      slug: "prefix-api",
      runtimeId: "api",
      type: "server",
      routingMode: "preserve-prefix",
      activePort: 3211,
    },
  ];

  const rendered = renderLunaGatewayConfig(routes);
  assert(rendered.includes("# MACHINE-OWNED: Luna generated app routes"), "generated gateway must identify the file as machine-owned");
  assert(rendered.indexOf("/apps/alpha-web/") < rendered.indexOf("/apps/prefix-api/"), "generated routes must be deterministic and sorted by slug/runtime");
  assert(rendered.indexOf("/apps/prefix-api/") < rendered.indexOf("/apps/spa-web/"), "generated route ordering remains deterministic across routing modes");
  assert(rendered.indexOf("/apps/spa-web/") < rendered.indexOf("/apps/zeta-api/"), "generated routes remain sorted through the final slug");

  assert(rendered.includes("alias /srv/bloombouquet/apps/alpha-web/current/;"), "static routes must point at the active current release");
  assert(rendered.includes("try_files $uri $uri/ =404;"), "static-files mode must not fall back to index.html");
  assert(rendered.includes("alias /srv/bloombouquet/apps/spa-web/current/;"), "SPA route must use the active release root");
  assert(rendered.includes("try_files $uri $uri/ /apps/spa-web/index.html;"), "SPA mode must fall back to the canonical app index document");

  assert(rendered.includes("proxy_pass http://127.0.0.1:3210/;"), "strip-prefix server mode must proxy with a trailing slash so the public prefix is removed");
  assert(rendered.includes("proxy_pass http://127.0.0.1:3211;"), "preserve-prefix server mode must proxy without a trailing slash so the canonical prefix remains intact");
  assert(rendered.includes("return 308 /apps/alpha-web/;"), "managed routes must canonicalize missing trailing slashes");

  assertThrows(
    () => renderLunaGatewayConfig([
      routes[0]!,
      { ...routes[0]!, runtimeId: "duplicate" },
    ]),
    /duplicate|slug/i,
    "one public slug must not render two competing managed routes",
  );

  assertThrows(
    () => renderLunaGatewayConfig([{
      slug: "unsafe-app",
      runtimeId: "web",
      type: "static",
      routingMode: "spa;\nreturn 200;" as never,
      releaseRoot: "/srv/bloombouquet/apps/unsafe-app",
    }]),
    /routingMode|routing mode/i,
    "renderer must reject routing values outside the validated enum instead of inserting raw Nginx text",
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
