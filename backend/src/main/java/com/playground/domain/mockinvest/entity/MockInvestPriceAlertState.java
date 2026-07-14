package com.playground.domain.mockinvest.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "mock_invest_price_alert_states", uniqueConstraints = {
        @UniqueConstraint(name = "uk_mock_price_alert_user_symbol_source", columnNames = {"user_id", "symbol", "source"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockInvestPriceAlertState {
    public enum AlertSource {
        HOLDING,
        WATCHLIST
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(nullable = false, length = 20)
    private String symbol;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AlertSource source;

    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal basePrice;

    @Column(nullable = false)
    @Builder.Default
    private Integer lastBucket = 0;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
