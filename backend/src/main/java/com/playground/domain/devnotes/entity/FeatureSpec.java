package com.playground.domain.devnotes.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "feature_specs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeatureSpec {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Priority priority;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Status status;

    public enum Priority { high, medium, low }
    public enum Status { planned, in_progress, done }
}
