package com.playground.domain.builder.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "builder_projects",
        indexes = {
                @Index(name = "idx_builder_project_owner_created", columnList = "owner_id,created_at"),
                @Index(name = "idx_builder_project_status", columnList = "status")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BuilderProject {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_id", nullable = false, length = 120)
    private String ownerId;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, length = 4000)
    private String brief;

    @Column(nullable = false, length = 20)
    private String platform;

    @Column(name = "feature_keys", nullable = false, length = 1000)
    private String featureKeys;

    @Column(nullable = false, length = 40)
    private String status;

    @Column(name = "auth_required", nullable = false)
    private boolean authRequired;

    @Column(name = "template_id", length = 160)
    private String templateId;

    @Column(name = "repository_full_name", length = 120)
    private String repositoryFullName;

    @Column(name = "preview_url", length = 500)
    private String previewUrl;

    @Column(name = "bloom_bouquet_registration_url", columnDefinition = "TEXT")
    private String bloomBouquetRegistrationUrl;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
