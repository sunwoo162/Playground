package com.playground.domain.notice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

public class NoticeDto {
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateRequest {
        private String title;
        private String content;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Response {
        private Long id;
        private String title;
        private String content;
        private String authorLogin;
        private LocalDateTime createdAt;
    }
}
