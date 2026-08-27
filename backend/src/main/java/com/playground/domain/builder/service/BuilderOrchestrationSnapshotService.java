package com.playground.domain.builder.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.playground.domain.builder.dto.BuilderWorkerDto;
import com.playground.domain.builder.entity.BuilderOrchestrationSnapshot;
import com.playground.domain.builder.entity.BuilderProjectRun;
import com.playground.domain.builder.repository.BuilderOrchestrationSnapshotRepository;
import com.playground.domain.builder.repository.BuilderProjectRunRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class BuilderOrchestrationSnapshotService {
    static final int MAX_PAYLOAD_BYTES = 1024 * 1024;

    private final BuilderProjectRunRepository runRepository;
    private final BuilderOrchestrationSnapshotRepository snapshotRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public Optional<BuilderWorkerDto.SnapshotResponse> findForClaim(Long runId) {
        return snapshotRepository.findByRun_Id(runId).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public Optional<BuilderWorkerDto.SnapshotResponse> findForOwner(String ownerId, Long projectId, Long runId) {
        String owner = requireOwner(ownerId);
        Long project = requireProjectId(projectId);
        Long requestedRun = requireRunId(runId);
        runRepository.findByIdAndProject_IdAndOwnerId(requestedRun, project, owner)
                .orElseThrow(() -> new NoSuchElementException("프로젝트 실행 기록을 찾을 수 없습니다."));
        return snapshotRepository.findByRun_Id(requestedRun).map(this::toResponse);
    }

    @Transactional
    public Optional<BuilderWorkerDto.SnapshotResponse> loadOwned(Long runId, String workerId) {
        BuilderProjectRun run = requireLockedRun(runId);
        requireRunningOwner(run, workerId);
        return snapshotRepository.findByRunIdForUpdate(runId).map(this::toResponse);
    }

    @Transactional
    public BuilderWorkerDto.SnapshotResponse save(Long runId, BuilderWorkerDto.SnapshotWriteRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("orchestration snapshot 요청이 비어 있습니다.");
        }

        BuilderProjectRun run = requireLockedRun(runId);
        String workerId = requireRunningOwner(run, request.getWorkerId());
        long expectedVersion = requireExpectedVersion(request.getExpectedVersion());
        int schemaVersion = requireSchemaVersion(request.getSchemaVersion());
        String phase = requirePhase(request.getPhase());
        String payloadJson = requirePayload(request.getPayloadJson());

        Optional<BuilderOrchestrationSnapshot> existing = snapshotRepository.findByRunIdForUpdate(runId);
        BuilderOrchestrationSnapshot snapshot;
        if (existing.isEmpty()) {
            if (expectedVersion != 0) {
                throw new IllegalStateException("snapshot이 아직 없으므로 expectedVersion은 0이어야 합니다.");
            }
            snapshot = BuilderOrchestrationSnapshot.builder()
                    .run(run)
                    .projectId(run.getProject().getId())
                    .schemaVersion(schemaVersion)
                    .version(1)
                    .phase(phase)
                    .payloadJson(payloadJson)
                    .updatedByWorkerId(workerId)
                    .build();
        } else {
            snapshot = existing.get();
            if (snapshot.getVersion() != expectedVersion) {
                throw new IllegalStateException(
                        "snapshot version이 변경되었습니다. expected=" + expectedVersion + ", actual=" + snapshot.getVersion()
                );
            }
            snapshot.setSchemaVersion(schemaVersion);
            snapshot.setVersion(snapshot.getVersion() + 1);
            snapshot.setPhase(phase);
            snapshot.setPayloadJson(payloadJson);
            snapshot.setUpdatedByWorkerId(workerId);
        }

        return toResponse(snapshotRepository.save(snapshot));
    }

    private BuilderProjectRun requireLockedRun(Long runId) {
        Long id = requireRunId(runId);
        return runRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new NoSuchElementException("프로젝트 실행 기록을 찾을 수 없습니다."));
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

    private String requireRunningOwner(BuilderProjectRun run, String workerId) {
        String worker = requireWorkerId(workerId);
        String status = run.getStatus() == null ? "" : run.getStatus().trim().toLowerCase(Locale.ROOT);
        if (!"running".equals(status)) {
            throw new IllegalStateException("running 상태의 실행만 snapshot을 갱신할 수 있습니다.");
        }
        if (!worker.equals(run.getWorkerId())) {
            throw new IllegalStateException("현재 실행 lease를 소유한 worker가 아닙니다.");
        }
        LocalDateTime leaseExpiresAt = run.getLeaseExpiresAt();
        if (leaseExpiresAt == null || !leaseExpiresAt.isAfter(LocalDateTime.now())) {
            throw new IllegalStateException("실행 lease가 만료되어 snapshot을 갱신할 수 없습니다.");
        }
        return worker;
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

    private long requireExpectedVersion(Long expectedVersion) {
        if (expectedVersion == null || expectedVersion < 0) {
            throw new IllegalArgumentException("expectedVersion은 0 이상의 값이어야 합니다.");
        }
        return expectedVersion;
    }

    private int requireSchemaVersion(Integer schemaVersion) {
        if (schemaVersion == null || schemaVersion < 1 || schemaVersion > 100) {
            throw new IllegalArgumentException("schemaVersion은 1부터 100 사이여야 합니다.");
        }
        return schemaVersion;
    }

    private String requirePhase(String phase) {
        String value = phase == null ? "" : phase.trim().toLowerCase(Locale.ROOT);
        if (!value.matches("[a-z][a-z0-9-]{0,39}")) {
            throw new IllegalArgumentException("orchestration phase 형식이 올바르지 않습니다.");
        }
        return value;
    }

    private String requirePayload(String payloadJson) {
        String value = payloadJson == null ? "" : payloadJson.trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("snapshot payload가 필요합니다.");
        }
        if (value.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) {
            throw new IllegalArgumentException("snapshot payload는 1MB 이하여야 합니다.");
        }
        try {
            JsonNode node = objectMapper.readTree(value);
            if (node == null || !node.isObject()) {
                throw new IllegalArgumentException("snapshot payload는 JSON object여야 합니다.");
            }
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("snapshot payload가 올바른 JSON이 아닙니다.");
        }
        return value;
    }

    private BuilderWorkerDto.SnapshotResponse toResponse(BuilderOrchestrationSnapshot snapshot) {
        return BuilderWorkerDto.SnapshotResponse.builder()
                .schemaVersion(snapshot.getSchemaVersion())
                .version(snapshot.getVersion())
                .phase(snapshot.getPhase())
                .payloadJson(snapshot.getPayloadJson())
                .updatedByWorkerId(snapshot.getUpdatedByWorkerId())
                .updatedAt(snapshot.getUpdatedAt())
                .build();
    }
}
