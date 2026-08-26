use crate::{
    agent_runtime::AgentTaskRunResult,
    failure_router_runtime::RouteAgentFailureResult,
    replan_runtime::ReplanProjectResult,
    retrospective_runtime::{
        run_project_retrospectives, RetrospectiveParticipantInput,
        RunProjectRetrospectivesInput, RunProjectRetrospectivesResult,
    },
};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAgentVersion {
    pub agent_id: String,
    pub role: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRetrospectiveContext {
    pub project_name: String,
    pub playbook_version: String,
    pub evolution_agent_version: String,
    #[serde(default)]
    pub agent_versions: Vec<RemoteAgentVersion>,
}

fn unique(values: Vec<String>, limit: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| {
            let trimmed = value.trim();
            !trimmed.is_empty() && seen.insert(trimmed.to_string())
        })
        .take(limit)
        .collect()
}

fn version_for(
    context: &RemoteRetrospectiveContext,
    agent_id: &str,
    role: &str,
) -> Result<String, String> {
    context
        .agent_versions
        .iter()
        .find(|agent| agent.agent_id == agent_id)
        .or_else(|| context.agent_versions.iter().find(|agent| agent.role == role))
        .map(|agent| agent.version.trim().to_string())
        .filter(|version| !version.is_empty())
        .ok_or_else(|| {
            format!(
                "Remote retrospective is missing a real version for Agent {agent_id} [{role}]"
            )
        })
}

fn append_participant(
    participants: &mut HashMap<String, RetrospectiveParticipantInput>,
    context: &RemoteRetrospectiveContext,
    agent_id: &str,
    role: &str,
    task_summary: Option<String>,
    evidence: Vec<String>,
    pull_request_numbers: Vec<u64>,
) -> Result<(), String> {
    let version = version_for(context, agent_id, role)?;
    let entry = participants
        .entry(agent_id.to_string())
        .or_insert_with(|| RetrospectiveParticipantInput {
            agent_id: agent_id.to_string(),
            role: role.to_string(),
            version,
            task_summaries: Vec::new(),
            evidence: Vec::new(),
            pull_request_numbers: Vec::new(),
        });

    if let Some(summary) = task_summary {
        entry.task_summaries.push(summary);
    }
    entry.evidence.extend(evidence);
    entry.pull_request_numbers.extend(pull_request_numbers);
    Ok(())
}

fn result_evidence(result: &AgentTaskRunResult) -> Vec<String> {
    let mut evidence = vec![
        result.report.summary.clone(),
        result.report.rationale_summary.clone(),
    ];
    if let Some(commit_sha) = &result.report.commit_sha {
        evidence.push(format!("commit {commit_sha}"));
    }
    if let Some(pr_number) = result.report.pull_request_number {
        evidence.push(format!("PR #{pr_number}"));
    }
    evidence.extend(result.report.evidence.clone());
    evidence.extend(result.report.verification.iter().map(|verification| {
        format!(
            "{}: {} · {}",
            verification.name, verification.status, verification.details
        )
    }));
    evidence
}

#[allow(clippy::too_many_arguments)]
pub async fn run_remote_project_retrospective(
    context: &RemoteRetrospectiveContext,
    project_id: &str,
    team_id: &str,
    team_name: &str,
    repository_full_name: &str,
    workspace_path: &str,
    user_request: &str,
    product_summary: &str,
    architecture_summary: &str,
    task_results: &[AgentTaskRunResult],
    failure_routes: &[RouteAgentFailureResult],
    replans: &[ReplanProjectResult],
    task_attempts: &HashMap<String, u32>,
) -> Result<RunProjectRetrospectivesResult, String> {
    if context.playbook_version.trim().is_empty()
        || context.evolution_agent_version.trim().is_empty()
        || context.project_name.trim().is_empty()
    {
        return Err("Remote retrospective context is incomplete".to_string());
    }

    let mut participants = HashMap::new();

    if let Some(pm) = context.agent_versions.iter().find(|agent| agent.role == "pm") {
        let replan_evidence = replans
            .iter()
            .flat_map(|replan| {
                [
                    format!("PM replan: {}", replan.proposal.summary),
                    format!("PM replan rationale: {}", replan.proposal.rationale_summary),
                ]
            })
            .collect::<Vec<_>>();
        append_participant(
            &mut participants,
            context,
            &pm.agent_id,
            "pm",
            Some(format!("PM plan: {}", context.project_name)),
            unique(
                [
                    vec![
                        format!("Repository: {repository_full_name}"),
                        format!("Architecture: {architecture_summary}"),
                        format!("Executed tasks: {}", task_attempts.len()),
                    ],
                    replan_evidence,
                ]
                .concat(),
                40,
            ),
            Vec::new(),
        )?;
    }

    for result in task_results {
        let attempts = task_attempts.get(&result.task_id).copied().unwrap_or(0);
        let mut prs = Vec::new();
        if let Some(pr_number) = result.report.pull_request_number {
            prs.push(pr_number);
        }
        prs.extend(result.report.reviewed_pull_requests.iter().copied());
        append_participant(
            &mut participants,
            context,
            &result.agent_id,
            &result.role,
            Some(format!(
                "{} [{}] · {} · attempts={attempts}",
                result.task_id, result.role, result.report.status
            )),
            unique(result_evidence(result), 40),
            prs,
        )?;
    }

    for route in failure_routes {
        let decision = &route.decision;
        append_participant(
            &mut participants,
            context,
            &route.router_agent_id,
            "debug-router",
            Some(format!(
                "{} [{}] → {}{}",
                route.failed_task_id,
                decision.failure_type,
                decision.route,
                decision
                    .owner_task_id
                    .as_ref()
                    .map(|owner| format!(" → {owner}"))
                    .unwrap_or_default()
            )),
            unique(
                [
                    vec![
                        format!("Severity: {}", decision.severity),
                        format!("Diagnosis: {}", decision.summary),
                        format!("Recommended action: {}", decision.recommended_action),
                    ],
                    decision.evidence.clone(),
                ]
                .concat(),
                40,
            ),
            Vec::new(),
        )?;
    }

    let mut normalized = participants
        .into_values()
        .map(|mut participant| {
            participant.task_summaries = unique(participant.task_summaries, 20);
            participant.evidence = unique(participant.evidence, 40);
            participant.pull_request_numbers.sort_unstable();
            participant.pull_request_numbers.dedup();
            participant.pull_request_numbers.truncate(40);
            participant
        })
        .collect::<Vec<_>>();
    normalized.sort_by(|left, right| left.agent_id.cmp(&right.agent_id));

    if normalized.is_empty() {
        return Err("Remote retrospective has no evidence-backed participants".to_string());
    }

    run_project_retrospectives(RunProjectRetrospectivesInput {
        project_id: project_id.to_string(),
        team_id: team_id.to_string(),
        team_name: team_name.to_string(),
        repository_full_name: repository_full_name.to_string(),
        workspace_path: workspace_path.to_string(),
        user_request: user_request.to_string(),
        product_summary: product_summary.to_string(),
        playbook_version: context.playbook_version.clone(),
        evolution_agent_version: context.evolution_agent_version.clone(),
        participants: normalized,
    })
    .await
}
