package com.playground.domain.actionnotifier.service;

import com.playground.domain.actionnotifier.dto.ActionNotifierDto;
import com.playground.domain.actionnotifier.entity.ActionRepositoryWatch;
import com.playground.domain.actionnotifier.repository.ActionRepositoryWatchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class ActionNotifierService {
    private static final Pattern REPO_PATTERN = Pattern.compile("(?:https://github\\.com/)?([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\\.git)?/?");

    private final ActionRepositoryWatchRepository watchRepository;
    private final GitHubActionsClient gitHubActionsClient;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.node-url:http://localhost:3000}")
    private String nodeUrl;

    public List<ActionNotifierDto.WatchResponse> list(String userId) {
        return watchRepository.findByUserIdOrderByUpdatedAtDesc(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ActionNotifierDto.WatchResponse connect(String userId, String repository) {
        RepoName repoName = parseRepository(repository);
        ActionRepositoryWatch watch = watchRepository
                .findByUserIdAndOwnerIgnoreCaseAndRepoIgnoreCase(userId, repoName.owner(), repoName.repo())
                .orElseGet(() -> ActionRepositoryWatch.builder()
                        .userId(userId)
                        .owner(repoName.owner())
                        .repo(repoName.repo())
                        .build());

        refreshWatch(watch, false);
        return toResponse(watchRepository.save(watch));
    }

    public ActionNotifierDto.RunsResponse runs(String userId, Long watchId) {
        ActionRepositoryWatch watch = watchRepository.findByIdAndUserId(watchId, userId)
                .orElseThrow(() -> new IllegalArgumentException("연결된 레포를 찾을 수 없습니다."));
        return ActionNotifierDto.RunsResponse.builder()
                .runs(gitHubActionsClient.recentRuns(watch.getOwner(), watch.getRepo(), 10))
                .build();
    }

    @Transactional
    public void delete(String userId, Long watchId) {
        ActionRepositoryWatch watch = watchRepository.findByIdAndUserId(watchId, userId)
                .orElseThrow(() -> new IllegalArgumentException("연결된 레포를 찾을 수 없습니다."));
        watchRepository.delete(watch);
    }

    @Scheduled(
            fixedDelayString = "${action-notifier.poll.fixed-delay-ms:120000}",
            initialDelayString = "${action-notifier.poll.initial-delay-ms:30000}"
    )
    @Transactional
    public void pollCompletedActions() {
        watchRepository.findAll().forEach(watch -> {
            try {
                refreshWatch(watch, true);
            } catch (Exception e) {
                log.debug("GitHub action watch failed for {}/{}: {}", watch.getOwner(), watch.getRepo(), e.getMessage());
            }
        });
    }

    private void refreshWatch(ActionRepositoryWatch watch, boolean notify) {
        GitHubActionsClient.WorkflowRun latest = gitHubActionsClient.latestRun(watch.getOwner(), watch.getRepo());
        if (latest == null) {
            return;
        }

        boolean isNewCompletedRun = notify
                && "completed".equalsIgnoreCase(latest.getStatus())
                && latest.getId() != null
                && !latest.getId().equals(watch.getNotifiedRunId());

        watch.setLastRunId(latest.getId());
        watch.setLastRunName(latest.getName());
        watch.setLastRunStatus(latest.getStatus());
        watch.setLastRunConclusion(latest.getConclusion());
        watch.setLastRunUrl(latest.getHtmlUrl());

        if (isNewCompletedRun) {
            watch.setNotifiedRunId(latest.getId());
            sendActionDonePush(watch, latest);
        }
    }

    private void sendActionDonePush(ActionRepositoryWatch watch, GitHubActionsClient.WorkflowRun run) {
        String conclusion = run.getConclusion() == null || run.getConclusion().isBlank() ? "completed" : run.getConclusion();
        String body = "%s/%s - %s 작업이 %s 상태로 끝났어요."
                .formatted(watch.getOwner(), watch.getRepo(), run.getName(), conclusion);
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, Object> payload = Map.of(
                    "userId", watch.getUserId(),
                    "title", "GitHub Action 완료",
                    "body", body,
                    "url", "/apps/action-notifier/",
                    "sound", true
            );
            restTemplate.postForEntity(nodeUrl + "/internal/push/send", new HttpEntity<>(payload, headers), String.class);
        } catch (Exception e) {
            log.warn("Action notifier push failed for {} {}/{}: {}", watch.getUserId(), watch.getOwner(), watch.getRepo(), e.getMessage());
        }
    }

    private ActionNotifierDto.WatchResponse toResponse(ActionRepositoryWatch watch) {
        return ActionNotifierDto.WatchResponse.builder()
                .id(watch.getId())
                .owner(watch.getOwner())
                .repo(watch.getRepo())
                .fullName(watch.getOwner() + "/" + watch.getRepo())
                .lastRunId(watch.getLastRunId())
                .lastRunName(watch.getLastRunName())
                .lastRunStatus(watch.getLastRunStatus())
                .lastRunConclusion(watch.getLastRunConclusion())
                .lastRunUrl(watch.getLastRunUrl())
                .updatedAt(watch.getUpdatedAt())
                .build();
    }

    private RepoName parseRepository(String repository) {
        String value = repository == null ? "" : repository.trim();
        Matcher matcher = REPO_PATTERN.matcher(value);
        if (!matcher.matches()) {
            throw new IllegalArgumentException("owner/repo 또는 GitHub URL 형식으로 입력해주세요.");
        }
        return new RepoName(matcher.group(1), matcher.group(2));
    }

    private record RepoName(String owner, String repo) {
    }
}
