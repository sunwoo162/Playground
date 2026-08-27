package com.playground.domain.bloombouquet.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "bloom_bouquet_projects", uniqueConstraints = @UniqueConstraint(name = "uk_bloom_project_team_slug", columnNames = {"team_id", "slug"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BloomBouquetProject {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    private BloomBouquetTeam team;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(nullable = false, length = 160)
    private String slug;

    @Column(nullable = false, length = 4000)
    private String description;

    @Column(nullable = false)
    private boolean published;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
