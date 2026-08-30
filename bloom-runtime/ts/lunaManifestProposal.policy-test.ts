import {
  inferLunaRoutingMode,
} from "./lunaManifestProposal";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  inferLunaRoutingMode({ runtimeType: "static" }) === "static-files",
  "ordinary static runtime defaults to static-files",
);
assert(
  inferLunaRoutingMode({
    runtimeType: "static",
    framework: "vite-react",
    hasClientRouter: true,
  }) === "spa",
  "Vite React client app with router evidence proposes spa",
);
assert(
  inferLunaRoutingMode({
    runtimeType: "static",
    framework: "vite-react",
    hasClientRouter: false,
  }) === "static-files",
  "Vite React without router evidence stays static-files",
);
assert(
  inferLunaRoutingMode({ runtimeType: "server", framework: "next" }) === "strip-prefix",
  "server runtime defaults to strip-prefix",
);
assert(
  inferLunaRoutingMode({
    runtimeType: "server",
    framework: "next",
    preservesPublicBasePath: true,
  }) === "preserve-prefix",
  "committed base-path preservation evidence proposes preserve-prefix",
);

console.log("PASS  Luna manifest routing proposal scenarios passed.");
