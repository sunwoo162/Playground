package com.playground.domain.builder.service;

import com.playground.domain.builder.dto.BuilderProjectDto;
import com.playground.domain.builder.entity.BuilderProject;
import com.playground.domain.builder.repository.BuilderProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BuilderProjectServiceTest {
    @Mock
    private BuilderProjectRepository repository;

    private BuilderProjectService service;

    @BeforeEach
    void setUp() {
        service = new BuilderProjectService(repository);
    }

    @Test
    void createNormalizesFeaturesAndPersistsDraftForOwner() {
        when(repository.save(any(BuilderProject.class))).thenAnswer(invocation -> {
            BuilderProject project = invocation.getArgument(0);
            project.setId(7L);
            return project;
        });

        BuilderProjectDto.CreateRequest request = new BuilderProjectDto.CreateRequest(
                "  수험생 혜택을 지도에서 찾는 서비스  ",
                "WEB",
                List.of("auth", "maps", "auth"),
                "benefit-map"
        );

        BuilderProjectDto.Response response = service.create("user-1", request);

        ArgumentCaptor<BuilderProject> captor = ArgumentCaptor.forClass(BuilderProject.class);
        verify(repository).save(captor.capture());
        BuilderProject saved = captor.getValue();

        assertEquals("user-1", saved.getOwnerId());
        assertEquals("web", saved.getPlatform());
        assertEquals("auth,maps", saved.getFeatureKeys());
        assertEquals("draft", saved.getStatus());
        assertTrue(saved.isAuthRequired());
        assertEquals(List.of("auth", "maps"), response.getFeatures());
        assertEquals(7L, response.getId());
    }

    @Test
    void createRejectsUnknownFeatureInsteadOfPersistingIt() {
        BuilderProjectDto.CreateRequest request = new BuilderProjectDto.CreateRequest(
                "서비스 아이디어",
                "web",
                List.of("auth", "shell-access"),
                null
        );

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.create("user-1", request)
        );

        assertTrue(error.getMessage().contains("지원하지 않는 기능"));
        verifyNoInteractions(repository);
    }

    @Test
    void getUsesOwnerScopedRepositoryLookup() {
        BuilderProject project = BuilderProject.builder()
                .id(3L)
                .ownerId("owner-a")
                .title("프로젝트")
                .brief("프로젝트 설명")
                .platform("web")
                .featureKeys("")
                .status("draft")
                .authRequired(false)
                .build();
        when(repository.findByIdAndOwnerId(3L, "owner-a")).thenReturn(Optional.of(project));

        BuilderProjectDto.Response response = service.get("owner-a", 3L);

        assertEquals(3L, response.getId());
        verify(repository).findByIdAndOwnerId(3L, "owner-a");
        verify(repository, never()).findById(anyLong());
    }

    @Test
    void listOnlyRequestsProjectsForCurrentOwner() {
        when(repository.findAllByOwnerIdOrderByCreatedAtDesc("owner-b")).thenReturn(List.of());

        assertTrue(service.list("owner-b").isEmpty());
        verify(repository).findAllByOwnerIdOrderByCreatedAtDesc("owner-b");
    }
}
