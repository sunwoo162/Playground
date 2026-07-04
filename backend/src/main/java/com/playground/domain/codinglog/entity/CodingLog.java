package com.playground.domain.codinglog.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "coding_logs")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CodingLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Platform platform;

    @Column(nullable = false)
    private String problemTitle;

    private String problemNumber;
    private String level;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Status status;

    @Column(columnDefinition = "TEXT")
    private String approach;

    @Column(columnDefinition = "TEXT")
    private String code;

    private String timeComplexity;

    private String tags; // JSON 배열 문자열

    @Column(nullable = false)
    private LocalDate date;

    @Builder.Default
    private boolean isPublic = true; // 기본값 공개

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    public enum Platform { programmers, baekjoon }
    public enum Status { solved, failed, retry }
}
