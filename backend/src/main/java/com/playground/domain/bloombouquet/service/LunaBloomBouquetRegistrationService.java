package com.playground.domain.bloombouquet.service;

import com.playground.domain.bloombouquet.dto.BloomBouquetDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class LunaBloomBouquetRegistrationService {
    private static final int SCHEMA_VERSION = 1;
    private static final Map<String, String> LUNA_TEAMS = Map.of(
            "rose", "장미",
            "lily", "백합",
            "tulip", "튤립",
            "sunflower", "해바라기",
            "cherry-blossom", "벚꽃"
    );

    private final BloomBouquetService bloomBouquetService;
    private final BloomBouquetOwnerProjectQueryService ownerProjectQueryService;

    @Transactional
    public BloomBouquetDto.LunaRegistrationResponse register(
            String ownerId,
            BloomBouquetDto.LunaRegistrationRequest request
    ) {
        if (request == null) {
            throw new IllegalArgumentException("Luna 등록 요청이 비어 있습니다.");
        }
        if (!Objects.equals(request.getSchemaVersion(), SCHEMA_VERSION)) {
            throw new IllegalArgumentException("지원하지 않는 Luna 등록 schema입니다.");
        }

        String teamId = required(request.getTeamId(), "teamId", 60);
        String canonicalTeamName = LUNA_TEAMS.get(teamId);
        if (canonicalTeamName == null) {
            throw new IllegalArgumentException("지원하지 않는 Luna 팀입니다: " + teamId);
        }
        if (!canonicalTeamName.equals(required(request.getTeamName(), "teamName", 120))) {
            throw new IllegalArgumentException("Luna 팀 이름이 teamId와 일치하지 않습니다.");
        }

        BloomBouquetDto.TeamResponse team = bloomBouquetService.listTeams(ownerId).stream()
                .filter(item -> teamId.equals(item.getSlug()))
                .findFirst()
                .orElseGet(() -> bloomBouquetService.createTeam(
                        ownerId,
                        new BloomBouquetDto.CreateTeamRequest(canonicalTeamName, teamId)
                ));

        String projectSlug = required(request.getProjectSlug(), "projectSlug", 160);
        BloomBouquetDto.ProjectResponse project = ownerProjectQueryService.listProjects(ownerId).stream()
                .filter(item -> team.getId().equals(item.getTeamId()))
                .filter(item -> projectSlug.equals(item.getSlug()))
                .findFirst()
                .orElseGet(() -> bloomBouquetService.createProject(
                        ownerId,
                        new BloomBouquetDto.CreateProjectRequest(
                                team.getId(),
                                required(request.getProjectName(), "projectName", 160),
                                projectSlug,
                                required(request.getDescription(), "description", 4000)
                        )
                ));

        String version = required(request.getVersion(), "version", 80);
        BloomBouquetDto.SubmissionResponse existing = existingVersion(project, version);
        if (existing != null) {
            assertSamePublication(existing, request);
            return BloomBouquetDto.LunaRegistrationResponse.builder()
                    .team(team)
                    .project(refreshProject(ownerId, project.getId()))
                    .submission(existing)
                    .build();
        }

        String repositoryUrl = required(request.getRepositoryUrl(), "repositoryUrl", 1000);
        BloomBouquetDto.SubmissionResponse submission = bloomBouquetService.publishSubmission(
                ownerId,
                project.getId(),
                new BloomBouquetDto.CreateSubmissionRequest(
                        version,
                        required(request.getDemoUrl(), "demoUrl", 2000),
                        repositoryUrl,
                        repositoryUrl,
                        request.isRequiresAuth(),
                        request.isRequiresAuth()
                                ? required(request.getAuthRedirectUri(), "authRedirectUri", 2000)
                                : null
                )
        );

        return BloomBouquetDto.LunaRegistrationResponse.builder()
                .team(team)
                .project(refreshProject(ownerId, project.getId()))
                .submission(submission)
                .build();
    }

    private BloomBouquetDto.SubmissionResponse existingVersion(
            BloomBouquetDto.ProjectResponse project,
            String version
    ) {
        if (!project.isPublished()) return null;
        return bloomBouquetService.getPublicProject(project.getId()).getSubmissions().stream()
                .filter(submission -> version.equals(submission.getVersion()))
                .findFirst()
                .orElse(null);
    }

    private void assertSamePublication(
            BloomBouquetDto.SubmissionResponse existing,
            BloomBouquetDto.LunaRegistrationRequest request
    ) {
        String repositoryUrl = required(request.getRepositoryUrl(), "repositoryUrl", 1000);
        String callback = request.isRequiresAuth()
                ? required(request.getAuthRedirectUri(), "authRedirectUri", 2000)
                : null;
        boolean same = Objects.equals(existing.getDemoUrl(), required(request.getDemoUrl(), "demoUrl", 2000))
                && Objects.equals(existing.getFrontendRepositoryUrl(), repositoryUrl)
                && Objects.equals(existing.getBackendRepositoryUrl(), repositoryUrl)
                && existing.isRequiresAuth() == request.isRequiresAuth()
                && Objects.equals(existing.getBouquetRedirectUri(), callback);
        if (!same) {
            throw new IllegalArgumentException("같은 버전에 다른 배포 정보가 이미 등록되어 있습니다.");
        }
    }

    private BloomBouquetDto.ProjectResponse refreshProject(String ownerId, Long projectId) {
        return ownerProjectQueryService.listProjects(ownerId).stream()
                .filter(item -> projectId.equals(item.getId()))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("등록된 프로젝트를 다시 찾을 수 없습니다."));
    }

    private String required(String value, String label, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException(label + "이 필요합니다.");
        }
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(label + "이 허용 길이를 초과했습니다.");
        }
        return normalized;
    }
}
