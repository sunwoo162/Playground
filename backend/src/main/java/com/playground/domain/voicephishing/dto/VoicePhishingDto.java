package com.playground.domain.voicephishing.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

public class VoicePhishingDto {
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateSessionRequest {
        private int riskScore;
        private int choicesCount;
        private int durationSeconds;
        private List<String> incidents;
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SessionResponse {
        private Long id;
        private String userId;
        private int riskScore;
        private int choicesCount;
        private int riskyChoicesCount;
        private boolean installedApp;
        private boolean transferredMoney;
        private boolean sharedAuthCode;
        private int durationSeconds;
        private String incidentSummary;
        private LocalDateTime createdAt;
    }
}
