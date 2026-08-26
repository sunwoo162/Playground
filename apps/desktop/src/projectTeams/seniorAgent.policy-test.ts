import { createInitialProjectTeamsState } from "./catalog";
import { SENIOR_AGENT_STANDARD } from "./seniorAgent";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function run() {
  const state = createInitialProjectTeamsState();

  assert(state.teams.length === 5, "Luna must initialize five equal-status delivery teams");
  assert(
    SENIOR_AGENT_STANDARD.minimumExperienceYears === 10,
    "senior operating baseline must remain 10+ years",
  );

  for (const team of state.teams) {
    assert(team.agents.length === 15, `${team.id} must initialize all 15 delivery Agent roles`);
    assert(
      team.agents.some((agent) => agent.role === "data-marketing"),
      `${team.id} must own an independent Data & Marketing Agent`,
    );

    const ids = new Set(team.agents.map((agent) => agent.id));
    assert(ids.size === team.agents.length, `${team.id} Agent IDs must be unique`);

    for (const agent of team.agents) {
      assert(
        agent.seniority === "senior-10-plus" && agent.minimumExperienceYears === 10,
        `${agent.id} must carry the common senior operating metadata`,
      );
      assert(
        agent.id === `${team.id}:${agent.role}`,
        `${agent.role} must remain an independent team-scoped Agent identity`,
      );
    }
  }

  console.log("PASS  Luna 15-Agent senior baseline scenarios passed.");
}

run();
