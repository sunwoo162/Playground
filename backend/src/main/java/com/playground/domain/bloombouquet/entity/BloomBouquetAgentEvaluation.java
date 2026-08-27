package com.playground.domain.bloombouquet.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "bloom_bouquet_agent_evaluations", uniqueConstraints = @UniqueConstraint(name = "uk_bloom_eval_run_role", columnNames = {"run_id", "agent_role"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BloomBouquetAgentEvaluation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private BloomBouquetEvaluationRun run;

    @Column(name = "agent_role", nullable = false, length = 60)
    private String agentRole;

    @Column(nullable = false)
    private Integer score;

    @Column(nullable = false)
    private Double stars;

    @Lob @Column(nullable = false)
    private String assessment;

    @Lob @Column(nullable = false)
    private String evidence;

    @Column(nullable = false, length = 20)
    private String severity;

    @Lob @Column(nullable = false)
    private String impact;

    @Lob @Column(nullable = false)
    private String recommendation;

    @Column(nullable = false, length = 10)
    private String priority;

    @Column(nullable = false, length = 20)
    private String confidence;

    @Lob @Column(name = "technical_terms")
    private String technicalTerms;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
