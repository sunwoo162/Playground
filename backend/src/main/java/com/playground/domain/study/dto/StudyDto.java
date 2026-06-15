package com.playground.domain.study.dto;

import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class StudyDto {

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SubjectRequest {
        private String name;
        private String color;
        private int dailyGoalMinutes;
    }

    @Getter @Builder
    public static class SubjectResponse {
        private Long id;
        private String name;
        private String color;
        private int dailyGoalMinutes;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SessionRequest {
        private Long subjectId;
        private String date;        // YYYY-MM-DD
        private String startTime;   // ISO datetime
        private String endTime;     // ISO datetime
        private int durationSeconds;
        private int durationMinutes;
        private String memo;
    }

    @Getter @Builder
    public static class SessionResponse {
        private Long id;
        private Long subjectId;
        private String date;
        private String startTime;
        private String endTime;
        private int durationSeconds;
        private int durationMinutes;
        private String memo;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class GoalRequest {
        private int totalMinutes;
    }

    @Getter @Builder
    public static class GoalResponse {
        private int totalMinutes;
    }
}
