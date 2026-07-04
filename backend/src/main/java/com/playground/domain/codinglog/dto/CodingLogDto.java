package com.playground.domain.codinglog.dto;

import lombok.*;

import java.time.LocalDateTime;

public class CodingLogDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Request {
        private String platform;
        private String problemTitle;
        private String problemNumber;
        private String level;
        private String status;
        private String approach;
        private String code;
        private String timeComplexity;
        private String tags;
        private String date;
        private boolean isPublic;
    }

    @Getter @Builder
    public static class Response {
        private Long id;
        private String userId;
        private String userLogin;
        private String userAvatarUrl;
        private String platform;
        private String problemTitle;
        private String problemNumber;
        private String level;
        private String status;
        private String approach;
        private String code;
        private String timeComplexity;
        private String tags;
        private String date;
        private boolean isPublic;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }
}
