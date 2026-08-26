package com.playground.domain.builder.service;

import com.playground.domain.builder.dto.BuilderWorkerDto;
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

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BuilderWorkerRunServiceTest {
    @Mock
    private BuilderProjectRepository projectRepository;

    @Mock
    private BuilderProjectRunRepository runRepository;

    private BuilderWorkerRunService service;

    @BeforeEach
    void setUp() {
        service = new BuilderWorkerRunService(projectRepository, runRepository);
    }

    @Test
    void claimReturnsEmptyWhenQueueHasNoAvailableRun() {
        when(runRepository.claimNextAvailableForUpdate()).thenReturn(Optional.empty());

        assertTrue(service.claimNext("worker-01").isEmpty());
        verify(runRepository, never()).save(any());
        verify(projectRepository, never()).save(any());
    }

    @Test
    void claimTransitionsQueuedRunAndProjectToRunningWithLease() {
        BuilderProject project = project(7L, "queued");
        BuilderProjectRun run = run(11L, project, "queued", null);
        when(runRepository.claimNextAvailableForUpdate()).thenReturn(Optional.of(run));
        when(runRepository.save(any(BuilderProjectRun.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BuilderWorkerDto.ClaimResponse response = service.claimNext("worker-01").orElseThrow();

        assertEquals(11L, response.getRunId());
        assertEquals(7L, response.getProjectId());
        assertEquals("worker-01", response.getWorkerId());
        assertEquals("running", response.getStatus());
        assertEquals(1, response.getClaimCount());
        assertNotNull(response.getLeaseExpiresAt());
        assertTrue(response.getLeaseExpiresAt().isAfter(LocalDateTime.now().plusSeconds(30)));
        assertEquals("running", project.getStatus());
        assertEquals("running", run.getStatus());
        assertNotNull(run.getStartedAt());
        assertNotNull(run.getHeartbeatAt());
        verify(projectRepository).save(project);
    }

    @Test
    void claimReassignsExpiredRunningRunAndIncrementsClaimCount() {
        BuilderProject project = project(7L, "running");
        BuilderProjectRun run = run(11L, project, "running", "worker-old");
        run.setClaimCount(2);
        run.setStartedAt(LocalDateTime.now().minusMinutes(5));
        run.setLeaseExpiresAt(LocalDateTime.now().minusSeconds(5));
        when(runRepository.claimNextAvailableForUpdate()).thenReturn(Optional.of(run));
        when(runRepository.save(any(BuilderProjectRun.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BuilderWorkerDto.ClaimResponse response = service.claimNext("worker-new").orElseThrow();

        assertEquals("worker-new", response.getWorkerId());
        assertEquals(3, response.getClaimCount());
        assertEquals("running", response.getStatus());
        assertEquals("worker-new", run.getWorkerId());
        assertTrue(run.getLeaseExpiresAt().isAfter(LocalDateTime.now().plusSeconds(30)));
    }

    @Test
    void heartbeatRejectsWorkerThatDoesNotOwnLease() {
        BuilderProjectRun run = run(11L, project(7L, "running"), "running", "worker-owner");
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.heartbeat(11L, "worker-other")
        );

        assertTrue(error.getMessage().contains("lease"));
        verify(runRepository, never()).save(any());
    }

    @Test
    void heartbeatRejectsExpiredLeaseEvenForSameWorker() {
        BuilderProjectRun run = run(11L, project(7L, "running"), "running", "worker-01");
        run.setLeaseExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.heartbeat(11L, "worker-01")
        );

        assertTrue(error.getMessage().contains("만료"));
        verify(runRepository, never()).save(any());
    }

    @Test
    void heartbeatExtendsLeaseForOwningWorker() {
        BuilderProjectRun run = run(11L, project(7L, "running"), "running", "worker-01");
        run.setLeaseExpiresAt(LocalDateTime.now().plusSeconds(5));
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));
        when(runRepository.save(any(BuilderProjectRun.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BuilderWorkerDto.RunStateResponse response = service.heartbeat(11L, "worker-01");

        assertEquals("running", response.getStatus());
        assertTrue(response.getLeaseExpiresAt().isAfter(LocalDateTime.now().plusSeconds(30)));
        assertNotNull(response.getHeartbeatAt());
    }

    @Test
    void completeUpdatesRunProjectAndArtifactMetadata() {
        BuilderProject project = project(7L, "running");
        BuilderProjectRun run = run(11L, project, "running", "worker-01");
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));
        when(runRepository.save(any(BuilderProjectRun.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BuilderWorkerDto.RunStateResponse response = service.complete(
                11L,
                "worker-01",
                "BloomBouquet/sample-project",
                "https://preview.example.com/sample-project"
        );

        assertEquals("completed", response.getStatus());
        assertEquals("completed", project.getStatus());
        assertEquals("BloomBouquet/sample-project", project.getRepositoryFullName());
        assertEquals("https://preview.example.com/sample-project", project.getPreviewUrl());
        assertNull(run.getLeaseExpiresAt());
        assertNotNull(run.getFinishedAt());
        verify(projectRepository).save(project);
    }

    @Test
    void completeIsIdempotentForSameWorker() {
        BuilderProject project = project(7L, "completed");
        BuilderProjectRun run = run(11L, project, "completed", "worker-01");
        run.setFinishedAt(LocalDateTime.now().minusSeconds(2));
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));

        BuilderWorkerDto.RunStateResponse response = service.complete(11L, "worker-01", null, null);

        assertEquals("completed", response.getStatus());
        verify(runRepository, never()).save(any());
        verify(projectRepository, never()).save(any());
    }

    @Test
    void completeRejectsStaleWorkerAfterLeaseWasReclaimed() {
        BuilderProject project = project(7L, "running");
        BuilderProjectRun run = run(11L, project, "running", "worker-new");
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.complete(11L, "worker-old", null, null)
        );

        assertTrue(error.getMessage().contains("lease"));
        assertEquals("running", run.getStatus());
        assertEquals("running", project.getStatus());
        verify(runRepository, never()).save(any());
        verify(projectRepository, never()).save(any());
    }

    @Test
    void completeRejectsExpiredLeaseForSameWorker() {
        BuilderProject project = project(7L, "running");
        BuilderProjectRun run = run(11L, project, "running", "worker-01");
        run.setLeaseExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.complete(11L, "worker-01", null, null)
        );

        assertTrue(error.getMessage().contains("만료"));
        assertEquals("running", project.getStatus());
        verify(runRepository, never()).save(any());
        verify(projectRepository, never()).save(any());
    }

    @Test
    void failMarksRunAndProjectFailedAndIsRetryableByUser() {
        BuilderProject project = project(7L, "running");
        BuilderProjectRun run = run(11L, project, "running", "worker-01");
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));
        when(runRepository.save(any(BuilderProjectRun.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BuilderWorkerDto.RunStateResponse response = service.fail(11L, "worker-01", "Codex app server exited unexpectedly");

        assertEquals("failed", response.getStatus());
        assertEquals("failed", project.getStatus());
        assertEquals("Codex app server exited unexpectedly", response.getFailureReason());
        assertNull(run.getLeaseExpiresAt());
        assertNotNull(run.getFinishedAt());
    }

    @Test
    void failIsIdempotentForSameWorker() {
        BuilderProject project = project(7L, "failed");
        BuilderProjectRun run = run(11L, project, "failed", "worker-01");
        run.setFailureReason("existing failure");
        run.setFinishedAt(LocalDateTime.now().minusSeconds(2));
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));

        BuilderWorkerDto.RunStateResponse response = service.fail(11L, "worker-01", "duplicate retry");

        assertEquals("failed", response.getStatus());
        assertEquals("existing failure", response.getFailureReason());
        verify(runRepository, never()).save(any());
        verify(projectRepository, never()).save(any());
    }

    private BuilderProject project(Long id, String status) {
        return BuilderProject.builder()
                .id(id)
                .ownerId("user-1")
                .title("테스트 프로젝트")
                .brief("테스트 프로젝트를 만들어줘")
                .platform("web")
                .featureKeys("auth,maps")
                .status(status)
                .authRequired(true)
                .templateId("community")
                .build();
    }

    private BuilderProjectRun run(Long id, BuilderProject project, String status, String workerId) {
        BuilderProjectRun run = BuilderProjectRun.builder()
                .id(id)
                .project(project)
                .ownerId("user-1")
                .status(status)
                .workerId(workerId)
                .build();
        if ("running".equals(status)) {
            run.setLeaseExpiresAt(LocalDateTime.now().plusSeconds(60));
        }
        return run;
    }
}
