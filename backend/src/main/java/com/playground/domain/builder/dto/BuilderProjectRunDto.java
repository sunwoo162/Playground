package com.playground.domain.builder.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class BuilderProjectRunDto {
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Response {
        private Long id;
        private Long projectId;
        private String status;
        private String workerId;
        private String failureReason;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private LocalDateTime startedAt;
        private LocalDateTime heartbeatAt;
        private LocalDateTime leaseExpiresAt;
        private LocalDateTime finishedAt;
        private int claimCount;
    }
}
