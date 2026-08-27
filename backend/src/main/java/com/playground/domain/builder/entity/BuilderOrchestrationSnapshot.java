package com.playground.domain.builder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "builder_orchestration_snapshots",
        uniqueConstraints = @UniqueConstraint(name = "uk_builder_snapshot_run", columnNames = "run_id"),
        indexes = @Index(name = "idx_builder_snapshot_project", columnList = "project_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BuilderOrchestrationSnapshot {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false, unique = true)
    private BuilderProjectRun run;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "schema_version", nullable = false)
    private int schemaVersion;

    @Column(nullable = false)
    private long version;

    @Column(nullable = false, length = 40)
    private String phase;

    @Lob
    @Column(name = "payload_json", nullable = false, columnDefinition = "LONGTEXT")
    private String payloadJson;

    @Column(name = "updated_by_worker_id", nullable = false, length = 120)
    private String updatedByWorkerId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
