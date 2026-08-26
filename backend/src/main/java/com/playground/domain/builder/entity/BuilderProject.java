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
                @Index(name = "idx_builder_project_owner_created", columnList = "ownerId,createdAt"),
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

    @Column(nullable = false, length = 120)
    private String ownerId;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, length = 4000)
    private String brief;

    @Column(nullable = false, length = 20)
    private String platform;

    @Column(nullable = false, length = 1000)
    private String featureKeys;

    @Column(nullable = false, length = 40)
    private String status;

    @Column(nullable = false)
    private boolean authRequired;

    @Column(length = 160)
    private String templateId;

    @Column(length = 120)
    private String repositoryFullName;

    @Column(length = 500)
    private String previewUrl;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
