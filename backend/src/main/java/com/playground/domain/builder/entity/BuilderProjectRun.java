package com.playground.domain.builder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "builder_project_runs",
        indexes = {
                @Index(name = "idx_builder_run_project_created", columnList = "project_id,created_at"),
                @Index(name = "idx_builder_run_owner_status", columnList = "owner_id,status"),
                @Index(name = "idx_builder_run_status_lease", columnList = "status,lease_expires_at")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BuilderProjectRun {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private BuilderProject project;

    @Column(name = "owner_id", nullable = false, length = 120)
    private String ownerId;

    @Column(nullable = false, length = 40)
    private String status;

    @Column(name = "worker_id", length = 120)
    private String workerId;

    @Column(name = "failure_reason", length = 1000)
    private String failureReason;

    @Column(name = "heartbeat_at")
    private LocalDateTime heartbeatAt;

    @Column(name = "lease_expires_at")
    private LocalDateTime leaseExpiresAt;

    @Builder.Default
    @Column(name = "claim_count", nullable = false, columnDefinition = "int default 0")
    private int claimCount = 0;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;
}
