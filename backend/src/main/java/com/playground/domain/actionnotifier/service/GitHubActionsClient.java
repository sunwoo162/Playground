package com.playground.domain.actionnotifier.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.playground.domain.actionnotifier.dto.ActionNotifierDto;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class GitHubActionsClient {

    private final ObjectMapper objectMapper;
    private final RestClient restClient = RestClient.builder()
            .baseUrl("https://api.github.com")
            .defaultHeader("Accept", "application/vnd.github+json")
            .defaultHeader("User-Agent", "playground-action-notifier")
            .build();

    @Value("${github.api-token:}")
    private String apiToken;

    public List<ActionNotifierDto.RunResponse> recentRuns(String owner, String repo, int size) {
        JsonNode root = getWorkflowRuns(owner, repo, Math.max(1, Math.min(size, 20)));
        List<ActionNotifierDto.RunResponse> runs = new ArrayList<>();
        for (JsonNode run : root.path("workflow_runs")) {
            runs.add(toRunResponse(run));
        }
        return runs;
    }

    public WorkflowRun latestRun(String owner, String repo) {
        JsonNode root = getWorkflowRuns(owner, repo, 1);
        JsonNode first = root.path("workflow_runs").isArray() && !root.path("workflow_runs").isEmpty()
                ? root.path("workflow_runs").get(0)
                : null;
        if (first == null || first.isMissingNode() || first.isNull()) {
            return null;
        }
        return WorkflowRun.builder()
                .id(first.path("id").asLong())
                .name(first.path("name").asText("GitHub Actions"))
                .status(first.path("status").asText(""))
                .conclusion(first.path("conclusion").isNull() ? "" : first.path("conclusion").asText(""))
                .branch(first.path("head_branch").asText(""))
                .htmlUrl(first.path("html_url").asText(""))
                .updatedAt(first.path("updated_at").asText(""))
                .build();
    }

    private JsonNode getWorkflowRuns(String owner, String repo, int perPage) {
        String path = "/repos/%s/%s/actions/runs?per_page=%d".formatted(owner, repo, perPage);
        String body = restClient.get()
                .uri(path)
                .headers(headers -> {
                    if (apiToken != null && !apiToken.isBlank()) {
                        headers.setBearerAuth(apiToken);
                    }
                })
                .retrieve()
                .body(String.class);
        try {
            return objectMapper.readTree(body);
        } catch (Exception e) {
            throw new IllegalStateException("GitHub Actions 응답을 읽을 수 없습니다.");
        }
    }

    private ActionNotifierDto.RunResponse toRunResponse(JsonNode run) {
        return ActionNotifierDto.RunResponse.builder()
                .id(run.path("id").asLong())
                .name(run.path("name").asText("GitHub Actions"))
                .status(run.path("status").asText(""))
                .conclusion(run.path("conclusion").isNull() ? "" : run.path("conclusion").asText(""))
                .branch(run.path("head_branch").asText(""))
                .htmlUrl(run.path("html_url").asText(""))
                .createdAt(run.path("created_at").asText(""))
                .updatedAt(run.path("updated_at").asText(""))
                .build();
    }

    @Getter
    @Builder
    public static class WorkflowRun {
        private Long id;
        private String name;
        private String status;
        private String conclusion;
        private String branch;
        private String htmlUrl;
        private String updatedAt;
    }
}
