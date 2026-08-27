import { selectIdleTeamForProject } from "./teamAllocation";
import type {
  ExecutableAgentRole,
  ProjectIntakeRecord,
  ProjectState,
  ProjectTeamsState,
  TeamId,
  TeamStrengthConfidence,
  TeamStrengthEvidence,
} from "./types";

const TEAM_ORDER: Array<{ id: TeamId; name: string }> = [
  { id: "rose", name: "장미" },
  { id: "lily", name: "백합" },
  { id: "tulip", name: "튤립" },
  { id: "sunflower", name: "해바라기" },
  { id: "cherry-blossom", name: "벚꽃" },
];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function strength(
  role: ExecutableAgentRole,
  confidence: TeamStrengthConfidence = "established",
  advantage = 0.25,
): TeamStrengthEvidence {
  return {
    role,
    confidence,
    projectCount: confidence === "established" ? 3 : 2,
    taskCount: confidence === "established" ? 7 : 4,
    teamIssueRate: 0.14,
    peerIssueRate: 0.14 + advantage,
    advantage,
    reason: `${role} measured evidence`,
  };
}

function project(teamId: TeamId, index: number): ProjectState {
  const createdAt = new Date(Date.UTC(2026, 0, index + 1)).toISOString();
  return {
    id: `PROJECT-TEST-${index}`,
    request: "test",
    teamId,
    status: "completed",
    createdAt,
    completedAt: createdAt,
    intake: null,
    teamAllocation: null,
    authPolicyId: "bouquet",
    executionPolicyId: "iseol-workflow",
    autonomyPolicyId: "independent-agent",
    decisionPolicyId: "reasoned-agent-decisions",
    documentationPolicyId: "documentation-evidence",
    qualityPolicyId: "production-service",
    deploymentPolicyId: "luna-apps-portal",
    plan: null,
    taskRuns: [],
    repositoryFullName: null,
    workspacePath: null,
    pmSessionId: null,
    runtimeFailureSource: null,
    runtimeMessage: "completed",
  };
}

function stateWith(
  assignments: TeamId[],
  strengths: Partial<Record<TeamId, TeamStrengthEvidence[]>> = {},
): ProjectTeamsState {
  const projects = assignments.map(project);
  return {
    schemaVersion: 1,
    teams: TEAM_ORDER.map((team) => {
      const completedProjects = assignments.filter((teamId) => teamId === team.id).length;
      return {
        ...team,
        status: "idle" as const,
        playbookVersion: "1.0.0",
        completedProjects,
        averageScore: null,
        activeProjectId: null,
        performanceProfile: {
          measuredProjectCount: completedProjects,
          rolePerformance: [],
          strengths: strengths[team.id] ?? [],
          updatedAt: "2026-08-26T00:00:00.000Z",
        },
        agents: [],
      };
    }),
    projects,
    decisions: [],
    evolutionAgentVersion: "1.0.0",
    intakeAgentVersion: "1.0.0",
    evolutionExperiments: [],
  };
}

function intake(
  requiredRoles: ExecutableAgentRole[],
  criticalRoles: ExecutableAgentRole[] = requiredRoles,
): ProjectIntakeRecord {
  return {
    id: "INTAKE-TEST",
    agentVersion: "1.0.0",
    summary: "test intake",
    primaryUser: "test user",
    primaryJob: "test job",
    complexity: "medium",
    requiredRoles,
    criticalRoles,
    needsAuth: false,
    userFacing: true,
    externalDependencies: [],
    riskFlags: [],
    assumptions: [],
    missingInputs: [],
    rationaleSummary: "test rationale",
    sessionId: null,
    eventsPath: "events.jsonl",
    outputPath: "output.json",
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

function run() {
  {
    const state = stateWith(["lily"]);
    const selection = selectIdleTeamForProject(state);
    assert(selection?.team.id === "rose", "legacy allocation must choose the least-assigned idle team");
    assert(
      selection?.record.strategy === "least-assigned-oldest-idle",
      "legacy allocation strategy must remain backward compatible",
    );
  }

  {
    const state = stateWith(
      ["lily"],
      { lily: [strength("frontend", "established", 0.3)] },
    );
    const selection = selectIdleTeamForProject(state, intake(["frontend"], ["frontend"]));
    assert(
      selection?.team.id === "lily",
      "an established relevant strength may win when the team is only one assignment ahead",
    );
    assert(
      selection?.record.establishedStrengthMatches?.[0]?.role === "frontend",
      "allocation record must preserve the evidence that affected selection",
    );
  }

  {
    const state = stateWith(
      ["lily", "lily"],
      { lily: [strength("frontend", "established", 0.5)] },
    );
    const selection = selectIdleTeamForProject(state, intake(["frontend"], ["frontend"]));
    assert(
      selection?.team.id === "rose",
      "performance evidence must not bypass the maximum assignment-gap fairness guard",
    );
  }

  {
    const state = stateWith(
      ["lily"],
      { lily: [strength("frontend", "emerging", 0.5)] },
    );
    const selection = selectIdleTeamForProject(state, intake(["frontend"], ["frontend"]));
    assert(
      selection?.team.id === "rose",
      "emerging evidence must not influence team assignment",
    );
  }

  {
    const state = stateWith(
      [],
      { tulip: [strength("backend", "established", 0.4)] },
    );
    const selection = selectIdleTeamForProject(
      state,
      intake(["frontend", "backend"], ["frontend"]),
    );
    assert(
      selection?.team.id === "rose",
      "required-role evidence outside criticalRoles must not override the critical-role allocation basis",
    );
  }

  console.log("PASS  Luna team allocation policy scenarios passed.");
}

run();
