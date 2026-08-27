import { createInitialProjectTeamsState } from "./catalog";
import { SENIOR_AGENT_STANDARD } from "./seniorAgent";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function roleCount(team: ReturnType<typeof createInitialProjectTeamsState>["teams"][number], role: string) {
  return team.agents.filter((agent) => agent.role === role).length;
}

function run() {
  const state = createInitialProjectTeamsState();

  assert(state.teams.length === 5, "Bloom must initialize five equal-status delivery teams");
  assert(
    SENIOR_AGENT_STANDARD.minimumExperienceYears === 10,
    "senior operating baseline must remain 10+ years",
  );

  for (const team of state.teams) {
    assert(team.agents.length === 30, `${team.id} must initialize all 30 delivery Agents`);
    assert(roleCount(team, "frontend") === 3, `${team.id} must expose three Frontend Agents`);
    assert(roleCount(team, "backend") === 3, `${team.id} must expose three Backend Agents`);
    assert(roleCount(team, "code-review") === 2, `${team.id} must expose two Code Review Agents`);
    assert(roleCount(team, "qa") === 2, `${team.id} must expose two QA Agents`);
    assert(roleCount(team, "documentation") === 2, `${team.id} must expose two Documentation Agents`);

    for (const specialistRole of [
      "database",
      "security",
      "devops",
      "accessibility",
      "performance",
      "api-integration",
      "test-automation",
      "ux-research",
    ] as const) {
      assert(
        team.agents.some((agent) => agent.role === specialistRole),
        `${team.id} must own an independent ${specialistRole} Agent`,
      );
    }

    const ids = new Set(team.agents.map((agent) => agent.id));
    assert(ids.size === team.agents.length, `${team.id} Agent IDs must be unique`);
    assert(ids.has(`${team.id}:frontend`), `${team.id} must preserve the primary Frontend Agent ID`);
    assert(ids.has(`${team.id}:frontend-2`) && ids.has(`${team.id}:frontend-3`), `${team.id} must expose Frontend capacity IDs`);
    assert(ids.has(`${team.id}:backend-2`) && ids.has(`${team.id}:backend-3`), `${team.id} must expose Backend capacity IDs`);

    for (const agent of team.agents) {
      assert(
        agent.seniority === "senior-10-plus" && agent.minimumExperienceYears === 10,
        `${agent.id} must carry the common senior operating metadata`,
      );
      assert(
        agent.id.startsWith(`${team.id}:${agent.role}`),
        `${agent.id} must remain a team-scoped identity for ${agent.role}`,
      );
    }
  }

  console.log("PASS  Bloom 30-Agent senior baseline scenarios passed.");
}

run();
