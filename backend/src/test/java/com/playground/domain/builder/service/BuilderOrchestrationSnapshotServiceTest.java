package com.playground.domain.builder.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.playground.domain.builder.dto.BuilderWorkerDto;
import com.playground.domain.builder.entity.BuilderOrchestrationSnapshot;
import com.playground.domain.builder.entity.BuilderProject;
import com.playground.domain.builder.entity.BuilderProjectRun;
import com.playground.domain.builder.repository.BuilderOrchestrationSnapshotRepository;
import com.playground.domain.builder.repository.BuilderProjectRunRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BuilderOrchestrationSnapshotServiceTest {
    @Mock
    private BuilderProjectRunRepository runRepository;

    @Mock
    private BuilderOrchestrationSnapshotRepository snapshotRepository;

    private BuilderOrchestrationSnapshotService service;

    @BeforeEach
    void setUp() {
        service = new BuilderOrchestrationSnapshotService(runRepository, snapshotRepository, new ObjectMapper());
    }

    @Test
    void firstSnapshotCreatesVersionOneForLeaseOwner() {
        BuilderProjectRun run = runningRun("worker-01");
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));
        when(snapshotRepository.findByRunIdForUpdate(11L)).thenReturn(Optional.empty());
        when(snapshotRepository.save(any(BuilderOrchestrationSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BuilderWorkerDto.SnapshotResponse response = service.save(
                11L,
                new BuilderWorkerDto.SnapshotWriteRequest(
                        "worker-01",
                        0L,
                        1,
                        "planning",
                        "{\"tasks\":[],\"phase\":\"planning\"}"
                )
        );

        assertEquals(1, response.getVersion());
        assertEquals(1, response.getSchemaVersion());
        assertEquals("planning", response.getPhase());
        assertEquals("worker-01", response.getUpdatedByWorkerId());
    }

    @Test
    void existingSnapshotRequiresMatchingExpectedVersion() {
        BuilderProjectRun run = runningRun("worker-01");
        BuilderOrchestrationSnapshot snapshot = snapshot(run, 3L);
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));
        when(snapshotRepository.findByRunIdForUpdate(11L)).thenReturn(Optional.of(snapshot));

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.save(
                        11L,
                        new BuilderWorkerDto.SnapshotWriteRequest(
                                "worker-01",
                                2L,
                                1,
                                "building",
                                "{\"tasks\":[]}"
                        )
                )
        );

        assertTrue(error.getMessage().contains("version"));
        verify(snapshotRepository, never()).save(any());
    }

    @Test
    void existingSnapshotIncrementsVersionWhenExpectedVersionMatches() {
        BuilderProjectRun run = runningRun("worker-01");
        BuilderOrchestrationSnapshot snapshot = snapshot(run, 3L);
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));
        when(snapshotRepository.findByRunIdForUpdate(11L)).thenReturn(Optional.of(snapshot));
        when(snapshotRepository.save(any(BuilderOrchestrationSnapshot.class))).thenAnswer(invocation -> invocation.getArgument(0));

        BuilderWorkerDto.SnapshotResponse response = service.save(
                11L,
                new BuilderWorkerDto.SnapshotWriteRequest(
                        "worker-01",
                        3L,
                        1,
                        "building",
                        "{\"tasks\":[{\"id\":\"frontend\"}]}"
                )
        );

        assertEquals(4L, response.getVersion());
        assertEquals("building", response.getPhase());
    }

    @Test
    void staleWorkerCannotOverwriteSnapshot() {
        BuilderProjectRun run = runningRun("worker-new");
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.save(
                        11L,
                        new BuilderWorkerDto.SnapshotWriteRequest(
                                "worker-old",
                                0L,
                                1,
                                "planning",
                                "{\"tasks\":[]}"
                        )
                )
        );

        assertTrue(error.getMessage().contains("lease"));
        verify(snapshotRepository, never()).save(any());
    }

    @Test
    void expiredLeaseCannotOverwriteSnapshot() {
        BuilderProjectRun run = runningRun("worker-01");
        run.setLeaseExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.save(
                        11L,
                        new BuilderWorkerDto.SnapshotWriteRequest(
                                "worker-01",
                                0L,
                                1,
                                "planning",
                                "{\"tasks\":[]}"
                        )
                )
        );

        assertTrue(error.getMessage().contains("만료"));
        verify(snapshotRepository, never()).save(any());
    }

    @Test
    void payloadMustBeJsonObject() {
        BuilderProjectRun run = runningRun("worker-01");
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.save(
                        11L,
                        new BuilderWorkerDto.SnapshotWriteRequest(
                                "worker-01",
                                0L,
                                1,
                                "planning",
                                "[1,2,3]"
                        )
                )
        );

        assertTrue(error.getMessage().contains("JSON object"));
    }

    @Test
    void loadOwnedReturnsPersistedSnapshotForCurrentLeaseOwner() {
        BuilderProjectRun run = runningRun("worker-01");
        BuilderOrchestrationSnapshot snapshot = snapshot(run, 2L);
        when(runRepository.findByIdForUpdate(11L)).thenReturn(Optional.of(run));
        when(snapshotRepository.findByRunIdForUpdate(11L)).thenReturn(Optional.of(snapshot));

        BuilderWorkerDto.SnapshotResponse response = service.loadOwned(11L, "worker-01").orElseThrow();

        assertEquals(2L, response.getVersion());
        assertEquals("planning", response.getPhase());
    }

    @Test
    void ownerCanReadSnapshotWithoutOwningWorkerLease() {
        BuilderProjectRun run = runningRun("worker-01");
        run.setStatus("completed");
        run.setLeaseExpiresAt(null);
        BuilderOrchestrationSnapshot snapshot = snapshot(run, 5L);
        when(runRepository.findByIdAndProject_IdAndOwnerId(11L, 7L, "user-1")).thenReturn(Optional.of(run));
        when(snapshotRepository.findByRun_Id(11L)).thenReturn(Optional.of(snapshot));

        BuilderWorkerDto.SnapshotResponse response = service.findForOwner("user-1", 7L, 11L).orElseThrow();

        assertEquals(5L, response.getVersion());
        assertEquals("planning", response.getPhase());
        verify(runRepository, never()).findByIdForUpdate(anyLong());
    }

    @Test
    void anotherOwnerCannotReadSnapshot() {
        when(runRepository.findByIdAndProject_IdAndOwnerId(11L, 7L, "user-2")).thenReturn(Optional.empty());

        NoSuchElementException error = assertThrows(
                NoSuchElementException.class,
                () -> service.findForOwner("user-2", 7L, 11L)
        );

        assertTrue(error.getMessage().contains("실행 기록"));
        verify(snapshotRepository, never()).findByRun_Id(anyLong());
    }

    private BuilderProjectRun runningRun(String workerId) {
        BuilderProject project = BuilderProject.builder()
                .id(7L)
                .ownerId("user-1")
                .title("테스트 프로젝트")
                .brief("테스트 프로젝트")
                .platform("web")
                .status("running")
                .build();
        return BuilderProjectRun.builder()
                .id(11L)
                .project(project)
                .ownerId("user-1")
                .status("running")
                .workerId(workerId)
                .leaseExpiresAt(LocalDateTime.now().plusSeconds(60))
                .build();
    }

    private BuilderOrchestrationSnapshot snapshot(BuilderProjectRun run, long version) {
        return BuilderOrchestrationSnapshot.builder()
                .id(21L)
                .run(run)
                .projectId(run.getProject().getId())
                .schemaVersion(1)
                .version(version)
                .phase("planning")
                .payloadJson("{\"tasks\":[]}")
                .updatedByWorkerId("worker-01")
                .build();
    }
}
