package com.playground.domain.codinglog.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "coding_log_comments")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CodingLogComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "log_id", nullable = false)
    private Long logId;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
