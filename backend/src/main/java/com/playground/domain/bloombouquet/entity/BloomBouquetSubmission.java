package com.playground.domain.bloombouquet.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "bloom_bouquet_submissions", uniqueConstraints = @UniqueConstraint(name = "uk_bloom_submission_project_version", columnNames = {"project_id", "version_label"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BloomBouquetSubmission {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private BloomBouquetProject project;

    @Column(name = "version_label", nullable = false, length = 80)
    private String version;

    @Column(name = "demo_url", nullable = false, length = 600)
    private String demoUrl;

    @Column(name = "frontend_repository_url", length = 600)
    private String frontendRepositoryUrl;

    @Column(name = "backend_repository_url", length = 600)
    private String backendRepositoryUrl;

    @Column(name = "requires_auth", nullable = false)
    private boolean requiresAuth;

    @Column(name = "auth_policy_id", nullable = false, length = 40)
    private String authPolicyId;

    @Column(name = "bouquet_client_id", unique = true, length = 64)
    private String bouquetClientId;

    @Column(name = "bouquet_redirect_uri", length = 2048)
    private String bouquetRedirectUri;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
