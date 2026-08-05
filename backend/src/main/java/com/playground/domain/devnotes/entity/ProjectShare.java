package com.playground.domain.devnotes.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "project_shares",
    uniqueConstraints = @UniqueConstraint(columnNames = {"project_id", "user_id"}),
    indexes = {
        @Index(name = "idx_project_share_user_status", columnList = "user_id, status"),
        @Index(name = "idx_project_share_project_status", columnList = "project_id, status")
    })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectShare {

    public enum Status { PENDING, ACCEPTED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId; // 공유받은 유저 ID

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private Status status = Status.ACCEPTED;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
