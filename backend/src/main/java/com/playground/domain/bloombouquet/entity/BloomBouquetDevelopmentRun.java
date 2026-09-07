package com.playground.domain.bloombouquet.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "bloom_bouquet_development_runs",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_bloom_development_project_run",
        columnNames = {"project_id", "harness_run_id"}
    )
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BloomBouquetDevelopmentRun {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private BloomBouquetProject project;

    @Column(name = "harness_run_id", nullable = false, length = 160)
    private String harnessRunId;

    @Lob
    @Column(name = "projection_json", nullable = false, columnDefinition = "LONGTEXT")
    private String projectionJson;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
