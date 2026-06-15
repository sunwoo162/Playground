package com.playground.domain.devnotes.dto;

import com.playground.domain.devnotes.entity.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

public class ProjectDto {

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Request {
        private String title;
        private String description;
        private String overview;
        private List<FeatureSpecDto> spec;
        private List<ApiSpecDto> api;
        private List<UserAnalysisDto> users;
    }

    @Getter
    @Builder
    public static class Response {
        private Long id;
        private String title;
        private String description;
        private String overview;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private List<FeatureSpecDto> spec;
        private List<ApiSpecDto> api;
        private List<UserAnalysisDto> users;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class FeatureSpecDto {
        private Long id;
        private String title;
        private String description;
        private String priority;
        private String status;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ApiSpecDto {
        private Long id;
        private String method;
        private String endpoint;
        private String description;
        private String requestBody;
        private String responseBody;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class UserAnalysisDto {
        private Long id;
        private String persona;
        private String goal;
        private String painPoint;
    }
}
