import { createInitialProjectTeamsState } from "./catalog";
import { SPECIALIST_AGENT_ROLES } from "./specialistPlanning";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testEveryTeamHasExpandedRoster() {
  const state = createInitialProjectTeamsState();

  assert(state.teams.length === 5, "Bloom must keep the five peer delivery teams");
  for (const team of state.teams) {
    assert(team.agents.length === 19, `${team.id} must contain 19 Agents after specialist expansion`);
    assert(new Set(team.agents.map((agent) => agent.id)).size === 19, `${team.id} Agent IDs must remain unique`);

    for (const role of SPECIALIST_AGENT_ROLES) {
      const agent = team.agents.find((candidate) => candidate.role === role);
      assert(agent, `${team.id} must include a ${role} specialist Agent`);
      assert(agent.id === `${team.id}:${role}`, `${team.id} ${role} Agent must use the stable team:role identity`);
      assert(agent.autonomy === "independent", `${team.id} ${role} Agent must remain independently accountable`);
      assert(agent.minimumExperienceYears === 10, `${team.id} ${role} Agent must use the senior operating standard`);
    }
  }
}

function run() {
  testEveryTeamHasExpandedRoster();
  console.log("catalog policy tests passed");
}

run();
