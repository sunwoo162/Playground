package com.playground.domain.builder.service;

import com.playground.domain.builder.entity.BuilderProject;
import com.playground.domain.builder.entity.BuilderProjectRun;
import com.playground.domain.builder.repository.BuilderProjectRepository;
import com.playground.domain.builder.repository.BuilderProjectRunRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BuilderWorkerRegistrationHandoffTest {
    @Mock BuilderProjectRepository projectRepository;
    @Mock BuilderProjectRunRepository runRepository;
    @Mock BuilderOrchestrationSnapshotService snapshotService;

    private BuilderWorkerRunService service;

    @BeforeEach
    void setUp() {
        service = new BuilderWorkerRunService(projectRepository, runRepository, snapshotService);
    }

    @Test
    void completionPersistsBloomBouquetRegistrationUrl() {
        BuilderProject project = BuilderProject.builder()
                .id(7L)
                .ownerId("user-1")
                .title("증빙함")
                .brief("증빙 자료를 관리하는 서비스")
                .platform("web")
                .featureKeys("auth")
                .status("running")
                .authRequired(true)
                .build();
        BuilderProjectRun run = BuilderProjectRun.builder()
                .id(11L)
                .project(project)
                .ownerId("user-1")
                .status("running")
                .workerId("worker-01")
                .leaseExpiresAt(LocalDateTime.now().plusSeconds(60))
                .build();
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));
        when(runRepository.save(any(BuilderProjectRun.class))).thenAnswer(invocation -> invocation.getArgument(0));

        String handoff = "https://bloombouquet.https.gsmsv.site/?mode=manage&luna=payload";
        service.complete(
                11L,
                "worker-01",
                "BloomBouquet/evidence-vault",
                "https://bloombouquet.https.gsmsv.site/apps/evidence-vault/",
                handoff
        );

        assertEquals(handoff, project.getBloomBouquetRegistrationUrl());
        assertEquals("completed", project.getStatus());
    }
}
