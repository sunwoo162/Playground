package com.playground.domain.codinglog.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "coding_logs",
        indexes = {
                @Index(name = "idx_coding_logs_user_created", columnList = "user_id, created_at"),
                @Index(name = "idx_coding_logs_public_created", columnList = "is_public, created_at"),
                @Index(name = "idx_coding_logs_user_date", columnList = "user_id, date")
        }
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CodingLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String userId;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Platform platform;

    @Column(nullable = false, length = 180)
    private String problemTitle;

    @Column(length = 64)
    private String problemNumber;
    @Column(length = 64)
    private String level;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Status status;

    @Column(length = 32)
    private String language;

    @Column(columnDefinition = "TEXT")
    private String approach;

    @Column(columnDefinition = "TEXT")
    private String code;

    @Column(length = 64)
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
