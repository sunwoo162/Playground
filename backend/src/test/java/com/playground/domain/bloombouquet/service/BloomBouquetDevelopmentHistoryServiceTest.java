package com.playground.domain.bloombouquet.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.playground.domain.bloombouquet.dto.BloomBouquetDto;
import com.playground.domain.bloombouquet.entity.BloomBouquetDevelopmentRun;
import com.playground.domain.bloombouquet.entity.BloomBouquetProject;
import com.playground.domain.bloombouquet.repository.BloomBouquetDevelopmentRunRepository;
import com.playground.domain.bloombouquet.repository.BloomBouquetProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BloomBouquetDevelopmentHistoryServiceTest {
    @Mock private BloomBouquetProjectRepository projectRepository;
    @Mock private BloomBouquetDevelopmentRunRepository developmentRunRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private BloomBouquetDevelopmentHistoryService service;

    @BeforeEach
    void setUp() {
        service = new BloomBouquetDevelopmentHistoryService(
                projectRepository,
                developmentRunRepository,
                objectMapper
        );
    }

    private BloomBouquetProject project(boolean published) {
        return BloomBouquetProject.builder()
                .id(7L)
                .slug("jobdam")
                .name("Jobdam")
                .description("상담 프로젝트")
                .published(published)
                .build();
    }

    private BloomBouquetDto.DevelopmentHistoryUpsertRequest request(
            String runId,
            String projectId
    ) throws Exception {
        return new BloomBouquetDto.DevelopmentHistoryUpsertRequest(
                objectMapper.readTree("""
                    {"version":1,"identity":{"projectId":"%s","taskId":"TASK-52","runId":"%s","agentId":"frontend-1"}}
                    """.formatted(projectId, runId))
        );
    }

    @Test
    void upsertCreatesRunBoundToPublishedProjectSlug() throws Exception {
        BloomBouquetProject project = project(true);
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(developmentRunRepository.findByProject_IdAndHarnessRunId(7L, "run-102"))
                .thenReturn(Optional.empty());
        when(developmentRunRepository.save(any(BloomBouquetDevelopmentRun.class)))
                .thenAnswer(invocation -> {
                    BloomBouquetDevelopmentRun run = invocation.getArgument(0);
                    run.setId(11L);
                    return run;
                });

        BloomBouquetDto.DevelopmentHistoryResponse response = service.upsert(
                7L,
                request("run-102", "jobdam")
        );

        assertEquals("run-102", response.getHarnessRunId());
        assertEquals("run-102", response.getProjection().path("identity").path("runId").asText());
        verify(developmentRunRepository).save(argThat(run ->
                run.getProject() == project && "run-102".equals(run.getHarnessRunId())
        ));
    }

    @Test
    void upsertReusesExistingProjectRunInsteadOfDuplicatingIt() throws Exception {
        BloomBouquetProject project = project(true);
        BloomBouquetDevelopmentRun existing = BloomBouquetDevelopmentRun.builder()
                .id(11L)
                .project(project)
                .harnessRunId("run-102")
                .projectionJson("{}")
                .build();
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(developmentRunRepository.findByProject_IdAndHarnessRunId(7L, "run-102"))
                .thenReturn(Optional.of(existing));
        when(developmentRunRepository.save(existing)).thenReturn(existing);

        service.upsert(7L, request("run-102", "jobdam"));

        verify(developmentRunRepository).save(existing);
        assertEquals(
                "run-102",
                objectMapper.readTree(existing.getProjectionJson()).path("identity").path("runId").asText()
        );
    }

    @Test
    void upsertRejectsProjectionForDifferentProjectSlug() throws Exception {
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project(true)));

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.upsert(7L, request("run-102", "other-project"))
        );

        assertTrue(error.getMessage().contains("projectId"));
        verifyNoInteractions(developmentRunRepository);
    }

    @Test
    void listPublicRejectsUnpublishedProject() {
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project(false)));

        assertThrows(NoSuchElementException.class, () -> service.listPublic(7L));

        verify(developmentRunRepository, never()).findByProject_IdOrderByCreatedAtDesc(anyLong());
    }

    @Test
    void listPublicReturnsStoredProjectionWithoutFilesystemPaths() throws Exception {
        BloomBouquetProject project = project(true);
        BloomBouquetDevelopmentRun run = BloomBouquetDevelopmentRun.builder()
                .id(11L)
                .project(project)
                .harnessRunId("run-102")
                .projectionJson(objectMapper.writeValueAsString(request("run-102", "jobdam").getProjection()))
                .build();
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(developmentRunRepository.findByProject_IdOrderByCreatedAtDesc(7L)).thenReturn(List.of(run));

        List<BloomBouquetDto.DevelopmentHistoryResponse> response = service.listPublic(7L);

        assertEquals(1, response.size());
        assertEquals("run-102", response.get(0).getHarnessRunId());
        assertFalse(response.get(0).getProjection().has("runDir"));
    }
}
