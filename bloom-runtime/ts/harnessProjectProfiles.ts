export type HarnessProjectProfileId =
  | "web-frontend"
  | "backend-service"
  | "fullstack-web"
  | "react-native"
  | "desktop-native"
  | "unknown";

export type HarnessProjectCommandCapability =
  | "install"
  | "lint"
  | "typecheck"
  | "test"
  | "build";

export type HarnessProjectPreviewMode = "browser" | "service" | "device" | "desktop" | "none";
export type HarnessProjectDeploymentMode = "web" | "service" | "mobile" | "desktop" | "unknown";

export type HarnessProjectProfile = {
  id: HarnessProjectProfileId;
  aliases: readonly string[];
  commandCapabilities: readonly HarnessProjectCommandCapability[];
  preview: HarnessProjectPreviewMode;
  deployment: HarnessProjectDeploymentMode;
};

const FULL_COMMANDS = ["install", "lint", "typecheck", "test", "build"] as const;

export const HARNESS_PROJECT_PROFILES: readonly HarnessProjectProfile[] = [
  {
    id: "web-frontend",
    aliases: ["web-frontend", "web", "frontend", "next.js", "nextjs", "vite", "react-web"],
    commandCapabilities: FULL_COMMANDS,
    preview: "browser",
    deployment: "web",
  },
  {
    id: "backend-service",
    aliases: ["backend-service", "backend", "service", "api", "spring", "spring-boot", "node-service"],
    commandCapabilities: FULL_COMMANDS,
    preview: "service",
    deployment: "service",
  },
  {
    id: "fullstack-web",
    aliases: ["fullstack-web", "fullstack", "full-stack", "nextjs-fullstack"],
    commandCapabilities: FULL_COMMANDS,
    preview: "browser",
    deployment: "web",
  },
  {
    id: "react-native",
    aliases: ["react-native", "react native", "expo", "mobile"],
    commandCapabilities: FULL_COMMANDS,
    preview: "device",
    deployment: "mobile",
  },
  {
    id: "desktop-native",
    aliases: ["desktop-native", "desktop", "wpf", "tauri", "electron", "native-desktop"],
    commandCapabilities: ["install", "lint", "typecheck", "test", "build"],
    preview: "desktop",
    deployment: "desktop",
  },
  {
    id: "unknown",
    aliases: ["unknown"],
    commandCapabilities: [],
    preview: "none",
    deployment: "unknown",
  },
];

export function resolveHarnessProjectProfile(projectType: string): HarnessProjectProfile {
  const normalized = projectType.trim().toLowerCase();
  return HARNESS_PROJECT_PROFILES.find((profile) =>
    profile.aliases.some((alias) => alias === normalized),
  ) ?? HARNESS_PROJECT_PROFILES[HARNESS_PROJECT_PROFILES.length - 1];
}
