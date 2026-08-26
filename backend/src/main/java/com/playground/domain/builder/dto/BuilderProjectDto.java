package com.playground.domain.builder.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

public class BuilderProjectDto {
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateRequest {
        private String brief;
        private String platform;
        private List<String> features;
        private String templateId;
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Response {
        private Long id;
        private String title;
        private String brief;
        private String platform;
        private List<String> features;
        private String status;
        private boolean authRequired;
        private String templateId;
        private String repositoryFullName;
        private String previewUrl;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }
}
