import type { AgentRole, AgentPermission } from "./types";
import { AGENT_PERMISSIONS } from "./policies";

export type AgentRuntimeIdentity = {
  agentId: string;
  role: AgentRole;
  autonomy: "independent";
  permissions: AgentPermission[];
};

export function createAgentRuntimeIdentity(agentId: string, role: AgentRole): AgentRuntimeIdentity {
  return {
    agentId,
    role,
    autonomy: "independent",
    permissions: [...AGENT_PERMISSIONS],
  };
}
