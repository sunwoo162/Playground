package com.playground.domain.mockinvest.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "mock_invest_orders", indexes = {
        @Index(name = "idx_mock_order_user_created", columnList = "user_id, created_at"),
        @Index(name = "idx_mock_order_user_symbol_created", columnList = "user_id, symbol, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MockInvestOrder {
    public enum OrderType { BUY, SELL }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private OrderType type;

    @Column(nullable = false, length = 20)
    private String symbol;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(nullable = false)
    private Long quantity;

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal price;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
