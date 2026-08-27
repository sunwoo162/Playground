package com.playground.domain.builder.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

public class BuilderWorkerDto {
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ClaimRequest {
        private String workerId;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class SnapshotResponse {
        private int schemaVersion;
        private long version;
        private String phase;
        private String payloadJson;
        private String updatedByWorkerId;
        private LocalDateTime updatedAt;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SnapshotWriteRequest {
        private String workerId;
        private Long expectedVersion;
        private Integer schemaVersion;
        private String phase;
        private String payloadJson;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ClaimResponse {
        private Long runId;
        private Long projectId;
        private String workerId;
        private String status;
        private LocalDateTime leaseExpiresAt;
        private int claimCount;
        private String title;
        private String brief;
        private String platform;
        private List<String> features;
        private boolean authRequired;
        private String templateId;
        private String repositoryFullName;
        private String previewUrl;
        private SnapshotResponse orchestrationSnapshot;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HeartbeatRequest {
        private String workerId;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CompleteRequest {
        private String workerId;
        private String repositoryFullName;
        private String previewUrl;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FailRequest {
        private String workerId;
        private String failureReason;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class RunStateResponse {
        private Long runId;
        private Long projectId;
        private String workerId;
        private String status;
        private String failureReason;
        private LocalDateTime startedAt;
        private LocalDateTime heartbeatAt;
        private LocalDateTime leaseExpiresAt;
        private LocalDateTime finishedAt;
        private int claimCount;
    }
}
