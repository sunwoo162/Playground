package com.playground.domain.lunadelivery.service;

import com.playground.domain.bloombouquet.dto.BloomBouquetDto;
import com.playground.domain.bloombouquet.service.LunaBloomBouquetRegistrationService;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.RegistrationRequest;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.RegistrationResponse;
import com.playground.domain.lunadelivery.entity.LunaDeliveryProject;
import com.playground.domain.lunadelivery.repository.LunaDeliveryProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.NoSuchElementException;

@Service
@RequiredArgsConstructor
public class LunaDeliveryRegistrationService {
    private final LunaBloomBouquetRegistrationService bloomRegistrationService;
    private final LunaDeliveryProjectRepository projectRepository;

    @Value("${app.luna.system-owner-id:}")
    private String systemOwnerId;

    @Transactional
    public RegistrationResponse register(RegistrationRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Luna machine registration request is required.");
        }
        String ownerId = systemOwnerId == null ? "" : systemOwnerId.trim();
        if (ownerId.isBlank()) {
            throw new IllegalStateException("Luna system owner identity is not configured.");
        }

        BloomBouquetDto.LunaRegistrationResponse registered = bloomRegistrationService.register(
                ownerId,
                new BloomBouquetDto.LunaRegistrationRequest(
                        request.schemaVersion(),
                        request.teamId(),
                        request.teamName(),
                        request.projectName(),
                        request.projectSlug(),
                        request.description(),
                        request.version(),
                        request.demoUrl(),
                        request.repositoryUrl(),
                        request.requiresAuth(),
                        request.authRedirectUri()
                )
        );

        BloomBouquetDto.SubmissionResponse submission = registered.getSubmission();
        if (registered.getTeam() == null || registered.getProject() == null || submission == null) {
            throw new IllegalStateException("BloomBouquet registration returned incomplete identity evidence.");
        }

        String projectSlug = request.projectSlug() == null ? "" : request.projectSlug().trim().toLowerCase();
        LunaDeliveryProject deliveryProject = projectRepository.findBySlugForUpdate(projectSlug)
                .orElseThrow(() -> new NoSuchElementException("Luna delivery project not found for registration."));
        deliveryProject.setBloomTeamId(registered.getTeam().getId());
        deliveryProject.setBloomProjectId(registered.getProject().getId());
        deliveryProject.setBloomSubmissionId(submission.getId());
        deliveryProject.setBloomEvaluationRunId(submission.getEvaluationRunId());
        projectRepository.save(deliveryProject);

        return new RegistrationResponse(
                registered.getTeam().getId(),
                registered.getProject().getId(),
                submission.getId(),
                submission.getEvaluationRunId(),
                submission.getEvaluationStatus()
        );
    }
}
