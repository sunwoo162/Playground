package com.playground.domain.bloombouquet.service;

import com.playground.domain.bloombouquet.dto.BloomBouquetDto;
import com.playground.domain.bloombouquet.entity.BloomBouquetEvaluationRun;
import com.playground.domain.bloombouquet.entity.BloomBouquetProject;
import com.playground.domain.bloombouquet.entity.BloomBouquetSubmission;
import com.playground.domain.bloombouquet.repository.BloomBouquetEvaluationRunRepository;
import com.playground.domain.bloombouquet.repository.BloomBouquetProjectRepository;
import com.playground.domain.bloombouquet.repository.BloomBouquetSubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class BloomBouquetOwnerProjectQueryService {
    private final BloomBouquetProjectRepository projectRepository;
    private final BloomBouquetSubmissionRepository submissionRepository;
    private final BloomBouquetEvaluationRunRepository runRepository;

    @Transactional(readOnly = true)
    public List<BloomBouquetDto.ProjectResponse> listProjects(String ownerId) {
        return projectRepository.findByTeam_OwnerIdOrderByUpdatedAtDesc(ownerId).stream()
                .map(this::toProjectResponse)
                .toList();
    }

    private BloomBouquetDto.ProjectResponse toProjectResponse(BloomBouquetProject project) {
        BloomBouquetDto.SubmissionResponse latest = submissionRepository
                .findTopByProjectIdOrderByCreatedAtDesc(project.getId())
                .map(submission -> toSubmissionResponse(
                        submission,
                        runRepository.findTopBySubmissionIdOrderByCreatedAtDesc(submission.getId()).orElse(null)
                ))
                .orElse(null);

        return BloomBouquetDto.ProjectResponse.builder()
                .id(project.getId())
                .teamId(project.getTeam().getId())
                .teamName(project.getTeam().getName())
                .name(project.getName())
                .slug(project.getSlug())
                .description(project.getDescription())
                .published(project.isPublished())
                .latestSubmission(latest)
                .createdAt(project.getCreatedAt())
                .updatedAt(project.getUpdatedAt())
                .build();
    }

    private BloomBouquetDto.SubmissionResponse toSubmissionResponse(
            BloomBouquetSubmission submission,
            BloomBouquetEvaluationRun run
    ) {
        return BloomBouquetDto.SubmissionResponse.builder()
                .id(submission.getId())
                .version(submission.getVersion())
                .demoUrl(submission.getDemoUrl())
                .frontendRepositoryUrl(submission.getFrontendRepositoryUrl())
                .backendRepositoryUrl(submission.getBackendRepositoryUrl())
                .requiresAuth(submission.isRequiresAuth())
                .authPolicyId(submission.getAuthPolicyId())
                .bouquetClientId(submission.getBouquetClientId())
                .bouquetRedirectUri(submission.getBouquetRedirectUri())
                .evaluationRunId(run == null ? null : run.getId())
                .evaluationStatus(run == null ? null : run.getStatus())
                .overallScore(run == null ? null : run.getOverallScore())
                .overallStars(run == null ? null : run.getOverallStars())
                .createdAt(submission.getCreatedAt())
                .build();
    }
}
