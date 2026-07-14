package com.playground.domain.mockinvest.dto;

import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public class MockInvestDto {
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class StockResponse {
        private String symbol;
        private String name;
        private BigDecimal price;
        private BigDecimal change;
        private BigDecimal changeRate;
        private Long volume;
        private BigDecimal marketCap;
        private String sector;
        private BigDecimal high;
        private BigDecimal low;
        private String description;
        private List<BigDecimal> points;
        private boolean realtime;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class ChartCandleResponse {
        private String datetime;
        private BigDecimal open;
        private BigDecimal high;
        private BigDecimal low;
        private BigDecimal close;
        private Long volume;
        private boolean realtime;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class HoldingResponse {
        private String symbol;
        private String name;
        private Long quantity;
        private BigDecimal averagePrice;
        private BigDecimal currentPrice;
        private BigDecimal invested;
        private BigDecimal evaluated;
        private BigDecimal profit;
        private BigDecimal profitRate;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class PortfolioResponse {
        private BigDecimal cash;
        private BigDecimal rewardedAmount;
        private BigDecimal invested;
        private BigDecimal evaluated;
        private BigDecimal totalAsset;
        private BigDecimal profit;
        private BigDecimal profitRate;
        private List<HoldingResponse> holdings;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class OrderResponse {
        private Long id;
        private String type;
        private String symbol;
        private String name;
        private Long quantity;
        private BigDecimal price;
        private LocalDateTime createdAt;
    }

    @Getter @Setter
    public static class TradeRequest {
        private String symbol;
        private Long quantity;
    }

    @Getter @Setter
    public static class WatchRequest {
        private String symbol;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class JournalResponse {
        private Long id;
        private String symbol;
        private String name;
        private String title;
        private String content;
        private String result;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    @Getter @Setter
    public static class JournalRequest {
        private String symbol;
        private String title;
        private String content;
        private String result;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class RankingResponse {
        private int rank;
        private String userId;
        private String nickname;
        private String avatarUrl;
        private BigDecimal totalAsset;
        private BigDecimal profitRate;
    }

    @Getter @Setter
    public static class StockRequestSubmitRequest {
        private String company;
        private String symbol;
        private String memo;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class StockRequestResponse {
        private Long id;
        private String userId;
        private String nickname;
        private String company;
        private String symbol;
        private String memo;
        private String status;
        private LocalDateTime createdAt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class AdminStatusResponse {
        private boolean admin;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class AdminAccountResponse {
        private String userId;
        private String login;
        private String nickname;
        private String avatarUrl;
        private BigDecimal cash;
        private BigDecimal rewardedAmount;
        private BigDecimal invested;
        private BigDecimal evaluated;
        private BigDecimal totalAsset;
        private BigDecimal profit;
        private BigDecimal profitRate;
    }

    @Getter @Setter
    public static class AdminCashRequest {
        private String userId;
        private BigDecimal amount;
        private String reason;
    }
}
