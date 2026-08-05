package com.playground.domain.study.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "study_sessions", indexes = {
        @Index(name = "idx_study_session_user_start", columnList = "user_id, start_time"),
        @Index(name = "idx_study_session_user_date", columnList = "user_id, date"),
        @Index(name = "idx_study_session_subject", columnList = "subject_id")
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class StudySession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(name = "subject_id", nullable = false)
    private Long subjectId;

    @Column(nullable = false)
    private LocalDate date;

    private LocalDateTime startTime;
    private LocalDateTime endTime;

    private int durationSeconds;
    private int durationMinutes;

    @Column(length = 1000)
    private String memo;
}
