package com.playground.domain.actionnotifier.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "action_repository_watches",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "owner_name", "repo_name"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ActionRepositoryWatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "owner_name", nullable = false)
    private String owner;

    @Column(name = "repo_name", nullable = false)
    private String repo;

    @Column(name = "last_run_id")
    private Long lastRunId;

    @Column(name = "last_run_status", length = 32)
    private String lastRunStatus;

    @Column(name = "last_run_conclusion", length = 32)
    private String lastRunConclusion;

    @Column(name = "last_run_name")
    private String lastRunName;

    @Column(name = "last_run_url", length = 512)
    private String lastRunUrl;

    @Column(name = "notified_run_id")
    private Long notifiedRunId;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
