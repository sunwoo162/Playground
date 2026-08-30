package com.playground.domain.lunadelivery.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "luna_delivery_projects",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_luna_delivery_project_slug", columnNames = "slug")
        },
        indexes = {
                @Index(name = "idx_luna_delivery_project_state", columnList = "delivery_state"),
                @Index(name = "idx_luna_delivery_project_adoption", columnList = "adoption_state")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LunaDeliveryProject {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 160)
    private String slug;

    @Column(name = "repository_full_name", nullable = false, length = 200)
    private String repositoryFullName;

    @Column(name = "main_sha", nullable = false, length = 64)
    private String mainSha;

    @Column(name = "manifest_digest", length = 128)
    private String manifestDigest;

    @Column(name = "adoption_state", nullable = false, length = 40)
    private String adoptionState;

    @Column(name = "delivery_state", nullable = false, length = 40)
    private String deliveryState;

    @Column(name = "public_url", length = 500)
    private String publicUrl;

    @Column(name = "active_release_sha", length = 64)
    private String activeReleaseSha;

    @Column(name = "previous_healthy_release_sha", length = 64)
    private String previousHealthyReleaseSha;

    @Column(name = "last_local_health", length = 4000)
    private String lastLocalHealth;

    @Column(name = "last_public_health", length = 4000)
    private String lastPublicHealth;

    @Column(name = "bloom_team_id")
    private Long bloomTeamId;

    @Column(name = "bloom_project_id")
    private Long bloomProjectId;

    @Column(name = "bloom_submission_id")
    private Long bloomSubmissionId;

    @Column(name = "bloom_evaluation_run_id")
    private Long bloomEvaluationRunId;

    @Column(name = "last_failure_code", length = 80)
    private String lastFailureCode;

    @Column(name = "last_failure_reason", length = 2000)
    private String lastFailureReason;

    @Builder.Default
    @Column(name = "retry_count", nullable = false, columnDefinition = "int default 0")
    private int retryCount = 0;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
