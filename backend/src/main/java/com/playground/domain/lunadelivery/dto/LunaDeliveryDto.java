package com.playground.domain.lunadelivery.dto;

import java.time.LocalDateTime;

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
            String failureReason
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
}
