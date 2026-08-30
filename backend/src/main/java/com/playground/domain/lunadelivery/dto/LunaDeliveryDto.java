package com.playground.domain.lunadelivery.dto;

import java.time.LocalDateTime;
import java.util.List;

public final class LunaDeliveryDto {
    private LunaDeliveryDto() {
    }

    public record UpsertProjectRequest(
            String slug,
            String repositoryFullName,
            String mainSha,
            String publicUrl
    ) {
    }

    public record TransitionRequest(
            String state,
            String failureCode,
            String failureReason,
            String localHealth,
            String publicHealth,
            LocalDateTime nextRetryAt
    ) {
        public TransitionRequest(String state, String failureCode, String failureReason) {
            this(state, failureCode, failureReason, null, null, null);
        }
    }

    public record RuntimeUpsertRequest(
            String runtimeType,
            Integer slotAPort,
            Integer slotBPort,
            String activeSlot,
            String candidateSlot
    ) {
    }

    public record RegistrationRequest(
            Integer schemaVersion,
            String teamId,
            String teamName,
            String projectName,
            String projectSlug,
            String description,
            String version,
            String demoUrl,
            String repositoryUrl,
            boolean requiresAuth,
            String authRedirectUri
    ) {
    }

    public record RegistrationResponse(
            Long teamId,
            Long projectId,
            Long submissionId,
            Long evaluationRunId,
            String evaluationStatus
    ) {
    }

    public record RuntimeResponse(
            Long id,
            String runtimeId,
            String runtimeType,
            Integer slotAPort,
            Integer slotBPort,
            String activeSlot,
            String candidateSlot
    ) {
    }

    public record ProjectStateResponse(
            Long id,
            String slug,
            String repositoryFullName,
            String mainSha,
            String manifestDigest,
            String adoptionState,
            String deliveryState,
            String publicUrl,
            String activeReleaseSha,
            String previousHealthyReleaseSha,
            String lastLocalHealth,
            String lastPublicHealth,
            Long bloomTeamId,
            Long bloomProjectId,
            Long bloomSubmissionId,
            Long bloomEvaluationRunId,
            String lastFailureCode,
            String lastFailureReason,
            int retryCount,
            LocalDateTime lastAttemptAt,
            LocalDateTime nextRetryAt
    ) {
    }

    public record ProjectDetailResponse(
            ProjectStateResponse project,
            List<RuntimeResponse> runtimes
    ) {
    }
}
