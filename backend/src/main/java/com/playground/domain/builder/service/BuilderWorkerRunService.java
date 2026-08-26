package com.playground.domain.builder.service;

import com.playground.domain.builder.dto.BuilderWorkerDto;
import com.playground.domain.builder.entity.BuilderProject;
import com.playground.domain.builder.entity.BuilderProjectRun;
import com.playground.domain.builder.repository.BuilderProjectRepository;
import com.playground.domain.builder.repository.BuilderProjectRunRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class BuilderWorkerRunService {
    static final long LEASE_SECONDS = 90;

    private final BuilderProjectRepository projectRepository;
    private final BuilderProjectRunRepository runRepository;

    @Transactional
    public Optional<BuilderWorkerDto.ClaimResponse> claimNext(String workerId) {
        String worker = requireWorkerId(workerId);
        Optional<BuilderProjectRun> candidate = runRepository.claimNextAvailableForUpdate();
        if (candidate.isEmpty()) {
            return Optional.empty();
        }

        BuilderProjectRun run = candidate.get();
        BuilderProject project = run.getProject();
        LocalDateTime now = LocalDateTime.now();

        run.setStatus("running");
        run.setWorkerId(worker);
        run.setFailureReason(null);
        if (run.getStartedAt() == null) {
            run.setStartedAt(now);
        }
        run.setHeartbeatAt(now);
        run.setLeaseExpiresAt(now.plusSeconds(LEASE_SECONDS));
        run.setFinishedAt(null);
        run.setClaimCount(Math.max(0, run.getClaimCount()) + 1);

        project.setStatus("running");
        runRepository.save(run);
        projectRepository.save(project);
        return Optional.of(toClaimResponse(run));
    }

    @Transactional
    public BuilderWorkerDto.RunStateResponse heartbeat(Long runId, String workerId) {
        BuilderProjectRun run = requireLockedRun(runId);
        requireRunningOwner(run, workerId);

        LocalDateTime now = LocalDateTime.now();
        run.setHeartbeatAt(now);
        run.setLeaseExpiresAt(now.plusSeconds(LEASE_SECONDS));
        return toStateResponse(runRepository.save(run));
    }

    @Transactional
    public BuilderWorkerDto.RunStateResponse complete(
            Long runId,
            String workerId,
            String repositoryFullName,
            String previewUrl
    ) {
        BuilderProjectRun run = requireLockedRun(runId);
        String worker = requireWorkerId(workerId);

        if ("completed".equals(normalizeStatus(run.getStatus())) && worker.equals(run.getWorkerId())) {
            return toStateResponse(run);
        }
        requireRunningOwner(run, worker);

        BuilderProject project = run.getProject();
        String repository = normalizeOptional(repositoryFullName, 120, "저장소 식별자");
        String preview = normalizeOptional(previewUrl, 500, "미리보기 URL");
        if (repository != null) {
            project.setRepositoryFullName(repository);
        }
        if (preview != null) {
            project.setPreviewUrl(preview);
        }

        LocalDateTime now = LocalDateTime.now();
        run.setStatus("completed");
        run.setFailureReason(null);
        run.setHeartbeatAt(now);
        run.setLeaseExpiresAt(null);
        run.setFinishedAt(now);
        project.setStatus("completed");

        projectRepository.save(project);
        return toStateResponse(runRepository.save(run));
    }

    @Transactional
    public BuilderWorkerDto.RunStateResponse fail(Long runId, String workerId, String failureReason) {
        BuilderProjectRun run = requireLockedRun(runId);
        String worker = requireWorkerId(workerId);

        if ("failed".equals(normalizeStatus(run.getStatus())) && worker.equals(run.getWorkerId())) {
            return toStateResponse(run);
        }
        requireRunningOwner(run, worker);

        String reason = normalizeFailureReason(failureReason);
        LocalDateTime now = LocalDateTime.now();
        run.setStatus("failed");
        run.setFailureReason(reason);
        run.setHeartbeatAt(now);
        run.setLeaseExpiresAt(null);
        run.setFinishedAt(now);
        run.getProject().setStatus("failed");

        projectRepository.save(run.getProject());
        return toStateResponse(runRepository.save(run));
    }

    private BuilderProjectRun requireLockedRun(Long runId) {
        if (runId == null || runId <= 0) {
            throw new IllegalArgumentException("실행 ID가 올바르지 않습니다.");
        }
        return runRepository.findByIdForUpdate(runId)
                .orElseThrow(() -> new NoSuchElementException("프로젝트 실행 기록을 찾을 수 없습니다."));
    }

    private void requireRunningOwner(BuilderProjectRun run, String workerId) {
        String worker = requireWorkerId(workerId);
        if (!"running".equals(normalizeStatus(run.getStatus()))) {
            throw new IllegalStateException("running 상태의 실행만 worker가 갱신할 수 있습니다.");
        }
        if (!worker.equals(run.getWorkerId())) {
            throw new IllegalStateException("현재 실행 lease를 소유한 worker가 아닙니다.");
        }
        LocalDateTime leaseExpiresAt = run.getLeaseExpiresAt();
        if (leaseExpiresAt == null || !leaseExpiresAt.isAfter(LocalDateTime.now())) {
            throw new IllegalStateException("실행 lease가 만료되어 다시 claim해야 합니다.");
        }
    }

    private String requireWorkerId(String workerId) {
        String value = workerId == null ? "" : workerId.trim();
        if (value.length() < 3 || value.length() > 120) {
            throw new IllegalArgumentException("workerId 길이가 올바르지 않습니다.");
        }
        if (!value.chars().allMatch(character ->
                Character.isLetterOrDigit(character)
                        || character == '-'
                        || character == '_'
                        || character == '.'
                        || character == ':'
        )) {
            throw new IllegalArgumentException("workerId 형식이 올바르지 않습니다.");
        }
        return value;
    }

    private String normalizeFailureReason(String failureReason) {
        String value = failureReason == null ? "" : failureReason.replaceAll("\\s+", " ").trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("실패 이유가 필요합니다.");
        }
        if (value.length() > 1000) {
            throw new IllegalArgumentException("실패 이유는 1000자 이하로 입력해야 합니다.");
        }
        return value;
    }

    private String normalizeOptional(String value, int maxLength, String label) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) {
            return null;
        }
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(label + "가 허용 길이를 초과했습니다.");
        }
        return normalized;
    }

    private String normalizeStatus(String status) {
        return status == null ? "" : status.trim().toLowerCase(Locale.ROOT);
    }

    private List<String> featuresOf(BuilderProject project) {
        if (project.getFeatureKeys() == null || project.getFeatureKeys().isBlank()) {
            return List.of();
        }
        return Arrays.stream(project.getFeatureKeys().split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
    }

    private BuilderWorkerDto.ClaimResponse toClaimResponse(BuilderProjectRun run) {
        BuilderProject project = run.getProject();
        return BuilderWorkerDto.ClaimResponse.builder()
                .runId(run.getId())
                .projectId(project.getId())
                .workerId(run.getWorkerId())
                .status(run.getStatus())
                .leaseExpiresAt(run.getLeaseExpiresAt())
                .claimCount(run.getClaimCount())
                .title(project.getTitle())
                .brief(project.getBrief())
                .platform(project.getPlatform())
                .features(featuresOf(project))
                .authRequired(project.isAuthRequired())
                .templateId(project.getTemplateId())
                .repositoryFullName(project.getRepositoryFullName())
                .previewUrl(project.getPreviewUrl())
                .build();
    }

    private BuilderWorkerDto.RunStateResponse toStateResponse(BuilderProjectRun run) {
        return BuilderWorkerDto.RunStateResponse.builder()
                .runId(run.getId())
                .projectId(run.getProject().getId())
                .workerId(run.getWorkerId())
                .status(run.getStatus())
                .failureReason(run.getFailureReason())
                .startedAt(run.getStartedAt())
                .heartbeatAt(run.getHeartbeatAt())
                .leaseExpiresAt(run.getLeaseExpiresAt())
                .finishedAt(run.getFinishedAt())
                .claimCount(run.getClaimCount())
                .build();
    }
}
