package com.playground.domain.study.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "study_sessions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class StudySession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false)
    private Long subjectId;

    @Column(nullable = false)
    private LocalDate date;

    private LocalDateTime startTime;
    private LocalDateTime endTime;

    private int durationSeconds;
    private int durationMinutes;

    private String memo;
}
