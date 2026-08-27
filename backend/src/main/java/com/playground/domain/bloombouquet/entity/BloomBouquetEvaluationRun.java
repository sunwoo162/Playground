package com.playground.domain.bloombouquet.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "bloom_bouquet_evaluation_runs", indexes = @Index(name = "idx_bloom_eval_status_created", columnList = "status,created_at"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BloomBouquetEvaluationRun {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "submission_id", nullable = false)
    private BloomBouquetSubmission submission;

    @Column(nullable = false, length = 40)
    private String status;

    @Column(name = "overall_score")
    private Integer overallScore;

    @Column(name = "overall_stars")
    private Double overallStars;

    @Lob
    @Column(name = "report_summary")
    private String reportSummary;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Version
    @Column(name = "lock_version", nullable = false)
    private Long lockVersion;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
