package com.playground.domain.bloombouquet.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.playground.domain.bloombouquet.dto.BloomBouquetDto;
import com.playground.domain.bloombouquet.entity.BloomBouquetDevelopmentRun;
import com.playground.domain.bloombouquet.entity.BloomBouquetProject;
import com.playground.domain.bloombouquet.repository.BloomBouquetDevelopmentRunRepository;
import com.playground.domain.bloombouquet.repository.BloomBouquetProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

@Service
@RequiredArgsConstructor
public class BloomBouquetDevelopmentHistoryService {
    private final BloomBouquetProjectRepository projectRepository;
    private final BloomBouquetDevelopmentRunRepository developmentRunRepository;
    private final ObjectMapper objectMapper;
    @Transactional
    public BloomBouquetDto.DevelopmentHistoryResponse upsert(
            Long projectId,
            BloomBouquetDto.DevelopmentHistoryUpsertRequest request
    ) {
        BloomBouquetProject project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("프로젝트를 찾을 수 없습니다."));
        JsonNode projection = request == null ? null : request.getProjection();
        String harnessRunId = validateProjection(project, projection);

        BloomBouquetDevelopmentRun run = developmentRunRepository
                .findByProject_IdAndHarnessRunId(projectId, harnessRunId)
                .orElseGet(BloomBouquetDevelopmentRun::new);
        run.setProject(project);
        run.setHarnessRunId(harnessRunId);
        run.setProjectionJson(writeProjection(projection));
        return toResponse(developmentRunRepository.save(run));
    }

    @Transactional(readOnly = true)
    public List<BloomBouquetDto.DevelopmentHistoryResponse> listPublic(Long projectId) {
        projectRepository.findById(projectId)
                .filter(BloomBouquetProject::isPublished)
                .orElseThrow(() -> new NoSuchElementException("프로젝트를 찾을 수 없습니다."));
        return developmentRunRepository.findByProject_IdOrderByCreatedAtDesc(projectId)
                .stream()
                .map(this::toResponse)
                .toList();
    }
    private String validateProjection(BloomBouquetProject project, JsonNode projection) {
        if (projection == null || !projection.isObject() || projection.path("version").asInt(-1) != 1) {
            throw new IllegalArgumentException("Harness history projection v1이 필요합니다.");
        }
        JsonNode identity = projection.path("identity");
        if (!identity.isObject()) {
            throw new IllegalArgumentException("Harness history identity가 필요합니다.");
        }
        String projectionProjectId = identity.path("projectId").asText("");
        if (!project.getSlug().equals(projectionProjectId)) {
            throw new IllegalArgumentException("Harness history projectId가 프로젝트 slug와 일치하지 않습니다.");
        }
        String runId = identity.path("runId").asText("").trim();
        if (runId.isEmpty() || runId.length() > 160) {
            throw new IllegalArgumentException("Harness history runId가 올바르지 않습니다.");
        }
        return runId;
    }

    private String writeProjection(JsonNode projection) {
        try {
            return objectMapper.writeValueAsString(projection);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("Harness history projection을 저장할 수 없습니다.", error);
        }
    }
    private BloomBouquetDto.DevelopmentHistoryResponse toResponse(BloomBouquetDevelopmentRun run) {
        try {
            return BloomBouquetDto.DevelopmentHistoryResponse.builder()
                    .id(run.getId())
                    .harnessRunId(run.getHarnessRunId())
                    .projection(objectMapper.readTree(run.getProjectionJson()))
                    .createdAt(run.getCreatedAt())
                    .updatedAt(run.getUpdatedAt())
                    .build();
        } catch (JsonProcessingException error) {
            throw new IllegalStateException(
                    "저장된 Harness history projection이 손상되었습니다: " + run.getHarnessRunId(),
                    error
            );
        }
    }
}
