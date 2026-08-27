import { createInitialProjectTeamsState } from "./catalog";
import { SENIOR_AGENT_STANDARD } from "./seniorAgent";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
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
    assert(
      team.agents.some((agent) => agent.role === "data-marketing"),
      `${team.id} must own an independent Data & Marketing Agent`,
    );

    for (const specialistRole of [
      "ux-research",
      "database",
      "api-integration",
      "security",
      "performance",
      "devops",
      "accessibility",
      "test-automation",
    ] as const) {
      assert(
        team.agents.some((agent) => agent.role === specialistRole),
        `${team.id} must own an independent ${specialistRole} Agent`,
      );
    }

    const ids = new Set(team.agents.map((agent) => agent.id));
    assert(ids.size === team.agents.length, `${team.id} Agent IDs must be unique`);

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
