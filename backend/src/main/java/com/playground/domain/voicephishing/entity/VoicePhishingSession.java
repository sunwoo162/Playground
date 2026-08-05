package com.playground.domain.voicephishing.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "voice_phishing_sessions", indexes = {
        @Index(name = "idx_voice_phishing_user_created", columnList = "user_id, created_at"),
        @Index(name = "idx_voice_phishing_risk_created", columnList = "risk_score, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VoicePhishingSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(name = "risk_score", nullable = false)
    private int riskScore;

    @Column(nullable = false)
    private int choicesCount;

    @Column(nullable = false)
    private int riskyChoicesCount;

    @Column(nullable = false)
    private boolean installedApp;

    @Column(nullable = false)
    private boolean transferredMoney;

    @Column(nullable = false)
    private boolean sharedAuthCode;

    @Column(nullable = false)
    private int durationSeconds;

    @Column(length = 1000)
    private String incidentSummary;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
