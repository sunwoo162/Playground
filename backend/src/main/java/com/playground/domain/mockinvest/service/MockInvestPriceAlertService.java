package com.playground.domain.mockinvest.service;

import com.playground.domain.mockinvest.dto.MockInvestDto;
import com.playground.domain.mockinvest.entity.MockInvestHolding;
import com.playground.domain.mockinvest.entity.MockInvestPriceAlertState;
import com.playground.domain.mockinvest.entity.MockInvestWatchlist;
import com.playground.domain.mockinvest.repository.MockInvestHoldingRepository;
import com.playground.domain.mockinvest.repository.MockInvestPriceAlertStateRepository;
import com.playground.domain.mockinvest.repository.MockInvestWatchlistRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class MockInvestPriceAlertService {
    private static final BigDecimal ALERT_STEP = BigDecimal.valueOf(5);
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final MockInvestHoldingRepository holdingRepository;
    private final MockInvestWatchlistRepository watchlistRepository;
    private final MockInvestPriceAlertStateRepository alertStateRepository;
    private final TwelveDataStockClient stockClient;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.node-url:http://localhost:3000}")
    private String nodeUrl;

    @Scheduled(
            fixedDelayString = "${mock-invest.alert.fixed-delay-ms:300000}",
            initialDelayString = "${mock-invest.alert.initial-delay-ms:60000}"
    )
    @Transactional
    public void scanPriceAlerts() {
        Map<String, MockInvestDto.StockResponse> quoteCache = new HashMap<>();
        holdingRepository.findAll().forEach(holding -> scanHolding(holding, quoteCache));
        watchlistRepository.findAll().forEach(watchlist -> scanWatchlist(watchlist, quoteCache));
    }

    private void scanHolding(MockInvestHolding holding, Map<String, MockInvestDto.StockResponse> quoteCache) {
        if (holding.getAveragePrice() == null || holding.getAveragePrice().compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        MockInvestDto.StockResponse stock = quote(holding.getSymbol(), quoteCache);
        if (stock == null || stock.getPrice() == null || stock.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        MockInvestPriceAlertState state = alertState(holding.getUserId(), holding.getSymbol(),
                MockInvestPriceAlertState.AlertSource.HOLDING, holding.getAveragePrice());
        if (state.getBasePrice().compareTo(holding.getAveragePrice()) != 0) {
            state.setBasePrice(holding.getAveragePrice());
            state.setLastBucket(0);
        }
        evaluateAndNotify(state, stock, holding.getName());
    }

    private void scanWatchlist(MockInvestWatchlist watchlist, Map<String, MockInvestDto.StockResponse> quoteCache) {
        MockInvestDto.StockResponse stock = quote(watchlist.getSymbol(), quoteCache);
        if (stock == null || stock.getPrice() == null || stock.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        MockInvestPriceAlertState state = alertState(watchlist.getUserId(), watchlist.getSymbol(),
                MockInvestPriceAlertState.AlertSource.WATCHLIST, stock.getPrice());
        evaluateAndNotify(state, stock, watchlist.getName());
    }

    private MockInvestDto.StockResponse quote(String symbol, Map<String, MockInvestDto.StockResponse> quoteCache) {
        return quoteCache.computeIfAbsent(symbol, key -> {
            try {
                return stockClient.quote(key);
            } catch (Exception e) {
                log.debug("Mock invest price alert quote failed for {}: {}", key, e.getMessage());
                return null;
            }
        });
    }

    private MockInvestPriceAlertState alertState(
            String userId,
            String symbol,
            MockInvestPriceAlertState.AlertSource source,
            BigDecimal basePrice
    ) {
        return alertStateRepository.findByUserIdAndSymbolAndSource(userId, symbol, source)
                .orElseGet(() -> alertStateRepository.save(MockInvestPriceAlertState.builder()
                        .userId(userId)
                        .symbol(symbol)
                        .source(source)
                        .basePrice(basePrice)
                        .lastBucket(0)
                        .build()));
    }

    private void evaluateAndNotify(MockInvestPriceAlertState state, MockInvestDto.StockResponse stock, String fallbackName) {
        BigDecimal basePrice = state.getBasePrice();
        if (basePrice == null || basePrice.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        BigDecimal currentPrice = stock.getPrice();
        BigDecimal changeRate = currentPrice.subtract(basePrice)
                .multiply(HUNDRED)
                .divide(basePrice, 4, RoundingMode.HALF_UP);
        int bucketMagnitude = changeRate.abs()
                .divide(ALERT_STEP, 0, RoundingMode.DOWN)
                .multiply(ALERT_STEP)
                .intValue();

        if (bucketMagnitude < ALERT_STEP.intValue()) {
            if (state.getLastBucket() != null && state.getLastBucket() != 0) {
                state.setLastBucket(0);
            }
            return;
        }

        int bucket = changeRate.signum() >= 0 ? bucketMagnitude : -bucketMagnitude;
        if (state.getLastBucket() != null && state.getLastBucket() == bucket) {
            return;
        }

        state.setLastBucket(bucket);
        sendPush(state.getUserId(), state.getSymbol(), displayName(stock, fallbackName), bucket, currentPrice);
    }

    private String displayName(MockInvestDto.StockResponse stock, String fallbackName) {
        if (stock.getName() != null && !stock.getName().isBlank()) {
            return stock.getName();
        }
        return fallbackName != null && !fallbackName.isBlank() ? fallbackName : stock.getSymbol();
    }

    private void sendPush(String userId, String symbol, String name, int bucket, BigDecimal currentPrice) {
        String direction = bucket > 0 ? "상승" : "하락";
        String sign = bucket > 0 ? "+" : "";
        String body = "%s(%s)이 기준가 대비 %s%d%% %s했어요. 현재가 $%s"
                .formatted(name, symbol, sign, bucket, direction, currentPrice.setScale(2, RoundingMode.HALF_UP));
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, String> payload = Map.of(
                    "userId", userId,
                    "title", "모의투자 가격 알림",
                    "body", body,
                    "url", "/apps/mock-invest/"
            );
            restTemplate.postForEntity(nodeUrl + "/internal/push/send", new HttpEntity<>(payload, headers), String.class);
        } catch (Exception e) {
            log.warn("Mock invest price alert push failed for {} {}: {}", userId, symbol, e.getMessage());
        }
    }
}
