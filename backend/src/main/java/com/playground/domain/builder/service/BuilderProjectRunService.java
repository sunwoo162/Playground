package com.playground.domain.builder.service;

import com.playground.domain.builder.dto.BuilderProjectRunDto;
import com.playground.domain.builder.entity.BuilderProject;
import com.playground.domain.builder.entity.BuilderProjectRun;
import com.playground.domain.builder.repository.BuilderProjectRepository;
import com.playground.domain.builder.repository.BuilderProjectRunRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class BuilderProjectRunService {
    private static final Set<String> ACTIVE_STATUSES = Set.of("queued", "running");
    private static final Set<String> STARTABLE_PROJECT_STATUSES = Set.of("draft", "failed");

    private final BuilderProjectRepository projectRepository;
    private final BuilderProjectRunRepository runRepository;

    @Transactional
    public BuilderProjectRunDto.Response requestRun(String ownerId, Long projectId) {
        String owner = requireOwner(ownerId);
        Long id = requireProjectId(projectId);
        BuilderProject project = projectRepository.findByIdAndOwnerIdForUpdate(id, owner)
                .orElseThrow(() -> new NoSuchElementException("프로젝트를 찾을 수 없습니다."));

        var activeRun = runRepository
                .findFirstByProject_IdAndOwnerIdAndStatusInOrderByCreatedAtDesc(id, owner, ACTIVE_STATUSES);
        if (activeRun.isPresent()) {
            BuilderProjectRun run = activeRun.get();
            if (!run.getStatus().equals(project.getStatus())) {
                project.setStatus(run.getStatus());
                projectRepository.save(project);
            }
            return toResponse(run);
        }

        String status = normalizeStatus(project.getStatus());
        if ("completed".equals(status)) {
            throw new IllegalStateException("완료된 프로젝트는 현재 다시 실행할 수 없습니다.");
        }
        if (!STARTABLE_PROJECT_STATUSES.contains(status)) {
            throw new IllegalStateException("프로젝트 실행 상태가 일관되지 않아 새 실행을 만들 수 없습니다.");
        }

        BuilderProjectRun run = runRepository.save(BuilderProjectRun.builder()
                .project(project)
                .ownerId(owner)
                .status("queued")
                .build());

        project.setStatus("queued");
        projectRepository.save(project);
        return toResponse(run);
    }

    @Transactional(readOnly = true)
    public List<BuilderProjectRunDto.Response> listRuns(String ownerId, Long projectId) {
        String owner = requireOwner(ownerId);
        Long id = requireProjectId(projectId);
        requireOwnedProject(owner, id);
        return runRepository.findAllByProject_IdAndOwnerIdOrderByCreatedAtDesc(id, owner)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public BuilderProjectRunDto.Response getRun(String ownerId, Long projectId, Long runId) {
        String owner = requireOwner(ownerId);
        Long id = requireProjectId(projectId);
        Long requestedRunId = requireRunId(runId);
        requireOwnedProject(owner, id);
        BuilderProjectRun run = runRepository.findByIdAndProject_IdAndOwnerId(requestedRunId, id, owner)
                .orElseThrow(() -> new NoSuchElementException("프로젝트 실행 기록을 찾을 수 없습니다."));
        return toResponse(run);
    }

    private void requireOwnedProject(String ownerId, Long projectId) {
        projectRepository.findByIdAndOwnerId(projectId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("프로젝트를 찾을 수 없습니다."));
    }

    private String requireOwner(String ownerId) {
        String value = ownerId == null ? "" : ownerId.trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("로그인 사용자를 확인할 수 없습니다.");
        }
        if (value.length() > 120) {
            throw new IllegalArgumentException("사용자 식별자가 허용 범위를 초과했습니다.");
        }
        return value;
    }

    private Long requireProjectId(Long projectId) {
        if (projectId == null || projectId <= 0) {
            throw new IllegalArgumentException("프로젝트 ID가 올바르지 않습니다.");
        }
        return projectId;
    }

    private Long requireRunId(Long runId) {
        if (runId == null || runId <= 0) {
            throw new IllegalArgumentException("실행 ID가 올바르지 않습니다.");
        }
        return runId;
    }

    private String normalizeStatus(String status) {
        return status == null ? "" : status.trim().toLowerCase();
    }

    private BuilderProjectRunDto.Response toResponse(BuilderProjectRun run) {
        return BuilderProjectRunDto.Response.builder()
                .id(run.getId())
                .projectId(run.getProject().getId())
                .status(run.getStatus())
                .workerId(run.getWorkerId())
                .failureReason(run.getFailureReason())
                .createdAt(run.getCreatedAt())
                .updatedAt(run.getUpdatedAt())
                .startedAt(run.getStartedAt())
                .finishedAt(run.getFinishedAt())
                .build();
    }
}
