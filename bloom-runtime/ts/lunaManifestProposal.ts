import type {
  LunaDeliveryRoutingMode,
} from "./lunaDeliveryManifest";

export type LunaRoutingProposalInput = {
  runtimeType: "static" | "server";
  framework?: string;
  hasClientRouter?: boolean;
  preservesPublicBasePath?: boolean;
};

export function inferLunaRoutingMode(
  input: LunaRoutingProposalInput,
): LunaDeliveryRoutingMode {
  if (input.runtimeType === "static") {
    const framework = input.framework?.trim().toLowerCase();
    if (framework === "vite-react" && input.hasClientRouter === true) {
      return "spa";
    }
    return "static-files";
  }

  return input.preservesPublicBasePath === true
    ? "preserve-prefix"
    : "strip-prefix";
}
