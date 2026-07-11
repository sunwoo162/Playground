package com.playground.domain.mockinvest.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "mock_invest_accounts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockInvestAccount {
    @Id
    @Column(name = "user_id", length = 64)
    private String userId;

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal cash;

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal rewardedAmount;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
