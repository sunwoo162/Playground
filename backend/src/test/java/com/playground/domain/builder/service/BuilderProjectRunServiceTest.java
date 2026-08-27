package com.playground.domain.builder.service;

import com.playground.domain.builder.dto.BuilderProjectRunDto;
import com.playground.domain.builder.entity.BuilderProject;
import com.playground.domain.builder.entity.BuilderProjectRun;
import com.playground.domain.builder.repository.BuilderProjectRepository;
import com.playground.domain.builder.repository.BuilderProjectRunRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BuilderProjectRunServiceTest {
    @Mock
    private BuilderProjectRepository projectRepository;

    @Mock
    private BuilderProjectRunRepository runRepository;

    private BuilderProjectRunService service;

    @BeforeEach
    void setUp() {
        service = new BuilderProjectRunService(projectRepository, runRepository);
    }

    @Test
    void requestRunCreatesQueuedRunAndTransitionsProject() {
        BuilderProject project = project(7L, "draft");
        when(projectRepository.findByIdAndOwnerIdForUpdate(7L, "user-1")).thenReturn(Optional.of(project));
        when(runRepository.findFirstByProject_IdAndOwnerIdAndStatusInOrderByCreatedAtDesc(
                eq(7L), eq("user-1"), anyCollection()))
                .thenReturn(Optional.empty());
        when(runRepository.save(any(BuilderProjectRun.class))).thenAnswer(invocation -> {
            BuilderProjectRun run = invocation.getArgument(0);
            run.setId(11L);
            return run;
        });

        BuilderProjectRunDto.Response response = service.requestRun("user-1", 7L);

        assertEquals(11L, response.getId());
        assertEquals(7L, response.getProjectId());
        assertEquals("queued", response.getStatus());
        assertEquals("queued", project.getStatus());
        verify(runRepository).save(argThat(run ->
                run.getProject() == project
                        && "user-1".equals(run.getOwnerId())
                        && "queued".equals(run.getStatus())
        ));
        verify(projectRepository).save(project);
    }

    @Test
    void requestRunReturnsExistingActiveRunInsteadOfCreatingDuplicate() {
        BuilderProject project = project(7L, "queued");
        BuilderProjectRun existing = run(21L, project, "queued");
        when(projectRepository.findByIdAndOwnerIdForUpdate(7L, "user-1")).thenReturn(Optional.of(project));
        when(runRepository.findFirstByProject_IdAndOwnerIdAndStatusInOrderByCreatedAtDesc(
                eq(7L), eq("user-1"), anyCollection()))
                .thenReturn(Optional.of(existing));

        BuilderProjectRunDto.Response response = service.requestRun("user-1", 7L);

        assertEquals(21L, response.getId());
        assertEquals("queued", response.getStatus());
        verify(runRepository, never()).save(any());
        verify(projectRepository, never()).save(any());
    }

    @Test
    void requestRunRepairsProjectStatusFromExistingActiveRun() {
        BuilderProject project = project(7L, "draft");
        BuilderProjectRun existing = run(21L, project, "running");
        when(projectRepository.findByIdAndOwnerIdForUpdate(7L, "user-1")).thenReturn(Optional.of(project));
        when(runRepository.findFirstByProject_IdAndOwnerIdAndStatusInOrderByCreatedAtDesc(
                eq(7L), eq("user-1"), anyCollection()))
                .thenReturn(Optional.of(existing));

        BuilderProjectRunDto.Response response = service.requestRun("user-1", 7L);

        assertEquals("running", response.getStatus());
        assertEquals("running", project.getStatus());
        verify(projectRepository).save(project);
        verify(runRepository, never()).save(any());
    }

    @Test
    void requestRunRejectsCompletedProject() {
        BuilderProject project = project(7L, "completed");
        when(projectRepository.findByIdAndOwnerIdForUpdate(7L, "user-1")).thenReturn(Optional.of(project));
        when(runRepository.findFirstByProject_IdAndOwnerIdAndStatusInOrderByCreatedAtDesc(
                eq(7L), eq("user-1"), anyCollection()))
                .thenReturn(Optional.empty());

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.requestRun("user-1", 7L)
        );

        assertTrue(error.getMessage().contains("완료된 프로젝트"));
        verify(runRepository, never()).save(any());
        verify(projectRepository, never()).save(any(BuilderProject.class));
    }

    @Test
    void requestRunRejectsQueuedProjectWithoutActiveRun() {
        BuilderProject project = project(7L, "queued");
        when(projectRepository.findByIdAndOwnerIdForUpdate(7L, "user-1")).thenReturn(Optional.of(project));
        when(runRepository.findFirstByProject_IdAndOwnerIdAndStatusInOrderByCreatedAtDesc(
                eq(7L), eq("user-1"), anyCollection()))
                .thenReturn(Optional.empty());

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> service.requestRun("user-1", 7L)
        );

        assertTrue(error.getMessage().contains("일관되지"));
        verify(runRepository, never()).save(any());
        verify(projectRepository, never()).save(any(BuilderProject.class));
    }

    @Test
    void listRunsIsScopedToOwnedProject() {
        BuilderProject project = project(7L, "queued");
        when(projectRepository.findByIdAndOwnerId(7L, "user-1")).thenReturn(Optional.of(project));
        when(runRepository.findAllByProject_IdAndOwnerIdOrderByCreatedAtDesc(7L, "user-1"))
                .thenReturn(List.of(run(21L, project, "queued")));

        List<BuilderProjectRunDto.Response> response = service.listRuns("user-1", 7L);

        assertEquals(1, response.size());
        assertEquals(21L, response.get(0).getId());
        verify(runRepository).findAllByProject_IdAndOwnerIdOrderByCreatedAtDesc(7L, "user-1");
    }

    private BuilderProject project(Long id, String status) {
        return BuilderProject.builder()
                .id(id)
                .ownerId("user-1")
                .title("테스트 프로젝트")
                .brief("테스트 프로젝트를 만들어줘")
                .platform("web")
                .featureKeys("auth")
                .status(status)
                .authRequired(true)
                .build();
    }

    private BuilderProjectRun run(Long id, BuilderProject project, String status) {
        return BuilderProjectRun.builder()
                .id(id)
                .project(project)
                .ownerId("user-1")
                .status(status)
                .build();
    }
}
