package com.playground.domain.bloombouquet.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

public class BloomBouquetDto {
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class CreateTeamRequest { private String name; private String slug; }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class CreateProjectRequest {
        private Long teamId; private String name; private String slug; private String description;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class CreateSubmissionRequest {
        private String version; private String demoUrl; private String frontendRepositoryUrl;
        private String backendRepositoryUrl; private boolean requiresAuth; private String authRedirectUri;

        public CreateSubmissionRequest(
                String version,
                String demoUrl,
                String frontendRepositoryUrl,
                String backendRepositoryUrl,
                boolean requiresAuth
        ) {
            this(version, demoUrl, frontendRepositoryUrl, backendRepositoryUrl, requiresAuth, null);
        }
    }

    @Getter @Builder @AllArgsConstructor
    public static class TeamResponse {
        private Long id; private String name; private String slug; private LocalDateTime createdAt;
    }

    @Getter @Builder @AllArgsConstructor
    public static class SubmissionResponse {
        private Long id; private String version; private String demoUrl;
        private String frontendRepositoryUrl; private String backendRepositoryUrl;
        private boolean requiresAuth; private String authPolicyId;
        private String bouquetClientId; private String bouquetRedirectUri;
        private Long evaluationRunId; private String evaluationStatus;
        private Integer overallScore; private Double overallStars; private LocalDateTime createdAt;
    }

    @Getter @Builder @AllArgsConstructor
    public static class ProjectResponse {
        private Long id; private Long teamId; private String teamName;
        private String name; private String slug; private String description; private boolean published;
        private SubmissionResponse latestSubmission; private LocalDateTime createdAt; private LocalDateTime updatedAt;
    }

    @Getter @Builder @AllArgsConstructor
    public static class ProjectDetailResponse {
        private ProjectResponse project; private List<SubmissionResponse> submissions;
    }

    @Getter @Builder @AllArgsConstructor
    public static class EvaluationClaimResponse {
        private Long runId; private Long submissionId; private Long projectId; private Long teamId;
        private String projectName; private String teamName; private String version; private String demoUrl;
        private String frontendRepositoryUrl; private String backendRepositoryUrl;
        private boolean requiresAuth; private String authPolicyId;
        private String bouquetClientId; private String bouquetRedirectUri;
        private String workerId; private LocalDateTime leaseExpiresAt; private int claimCount;
    }

    @Getter @Builder @AllArgsConstructor
    public static class EvaluationLeaseResponse {
        private Long runId; private String workerId; private String status;
        private LocalDateTime heartbeatAt; private LocalDateTime leaseExpiresAt; private int claimCount;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class AgentEvaluationRequest {
        private String agentRole; private Integer score; private Double stars; private String assessment;
        private List<String> evidence; private String severity; private String impact; private String recommendation;
        private String priority; private String confidence; private List<String> technicalTerms;
    }

    @Getter @Builder @AllArgsConstructor
    public static class AgentEvaluationResponse {
        private String agentRole; private Integer score; private Double stars; private String assessment;
        private List<String> evidence; private String severity; private String impact; private String recommendation;
        private String priority; private String confidence; private List<String> technicalTerms;
        private LocalDateTime createdAt;
    }

    @Getter @Builder @AllArgsConstructor
    public static class EvaluationReportResponse {
        private Long runId; private String status; private Integer overallScore; private Double overallStars;
        private String reportSummary; private List<AgentEvaluationResponse> agentEvaluations;
        private LocalDateTime startedAt; private LocalDateTime completedAt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class CompleteEvaluationRequest {
        private Integer overallScore; private Double overallStars; private String reportSummary;
    }
}
