package com.playground.domain.actionnotifier.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

public class ActionNotifierDto {

    @Getter
    @Setter
    public static class ConnectRequest {
        private String repository;
    }

    @Getter
    @Setter
    public static class NotificationRequest {
        private Boolean enabled;
    }

    @Getter
    @Setter
    @Builder
    public static class WatchResponse {
        private Long id;
        private String owner;
        private String repo;
        private String fullName;
        private String actionsUrl;
        private Boolean enabled;
        private Long lastRunId;
        private String lastRunName;
        private String lastRunStatus;
        private String lastRunConclusion;
        private String lastRunUrl;
        private LocalDateTime updatedAt;
    }

    @Getter
    @Setter
    @Builder
    public static class RunResponse {
        private Long id;
        private String name;
        private String status;
        private String conclusion;
        private String branch;
        private String htmlUrl;
        private String createdAt;
        private String updatedAt;
    }

    @Getter
    @Setter
    @Builder
    public static class RunsResponse {
        private List<RunResponse> runs;
    }
}
