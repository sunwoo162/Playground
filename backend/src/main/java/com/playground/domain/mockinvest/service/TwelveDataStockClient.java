package com.playground.domain.mockinvest.service;

import com.playground.domain.mockinvest.dto.MockInvestDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Component
@RequiredArgsConstructor
public class TwelveDataStockClient {
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${twelve-data.base-url:https://api.twelvedata.com}")
    private String baseUrl;

    @Value("${twelve-data.api-key:}")
    private String apiKey;

    @Value("${twelve-data.mock:false}")
    private boolean mock;

    public List<MockInvestDto.StockResponse> search(String keyword) {
        String q = keyword == null ? "" : keyword.trim().toLowerCase();
        ensureTwelveDataEnabled();
        return twelveDataStocks(q);
    }

    public MockInvestDto.StockResponse quote(String symbol) {
        ensureTwelveDataEnabled();
        return twelveDataQuote(symbol);
    }

    private boolean canUseTwelveData() {
        return !mock && apiKey != null && !apiKey.isBlank();
    }

    private void ensureTwelveDataEnabled() {
        if (!canUseTwelveData()) {
            throw new IllegalStateException("Twelve Data API key is not configured");
        }
    }

    private MockInvestDto.StockResponse twelveDataQuote(String symbol) {
        String normalizedSymbol = normalizeSymbol(symbol);
        String providerQuery = symbolQuery(normalizedSymbol);
        Map<?, ?> quote = get("/quote?" + providerQuery);
        if (quote == null || quote.get("status") != null && "error".equals(String.valueOf(quote.get("status")))) {
            throw new IllegalStateException("Twelve Data quote response missing");
        }

        BigDecimal price = firstNumber(quote.get("close"), quote.get("previous_close"));
        if (price.compareTo(BigDecimal.ZERO) == 0) throw new IllegalStateException("Twelve Data quote price missing");

        BigDecimal change = num(quote.get("change"));
        BigDecimal changeRate = num(quote.get("percent_change"));
        List<BigDecimal> pointValues = twelveDataPoints(providerQuery);
        return MockInvestDto.StockResponse.builder()
                .symbol(normalizedSymbol)
                .name(text(quote.get("name"), normalizedSymbol))
                .price(price)
                .change(change)
                .changeRate(changeRate)
                .volume(num(quote.get("volume")).longValue())
                .marketCap(BigDecimal.ZERO)
                .sector(text(quote.get("exchange"), "KRX"))
                .high(firstNumber(quote.get("high"), price))
                .low(firstNumber(quote.get("low"), price))
                .description("Twelve Data에서 조회한 시세입니다.")
                .points(pointValues)
                .realtime(true)
                .build();
    }

    private List<MockInvestDto.StockResponse> twelveDataStocks(String keyword) {
        try {
            Object rows = stockRows();
            if (!(rows instanceof List<?> list)) return List.of();
            return list.stream()
                    .filter(Map.class::isInstance)
                    .map(row -> (Map<?, ?>) row)
                    .filter(row -> {
                        String symbol = normalizeSymbol(text(row.get("symbol"), ""));
                        String name = text(row.get("name"), "");
                        return symbol.matches("\\d{6}")
                                && (keyword.isBlank()
                                || symbol.toLowerCase().contains(keyword)
                                || name.toLowerCase().contains(keyword));
                    })
                    .limit(keyword.isBlank() ? 500 : 80)
                    .map(row -> {
                        String symbol = normalizeSymbol(text(row.get("symbol"), ""));
                        String name = text(row.get("name"), symbol);
                        String exchange = text(row.get("exchange"), "KRX");
                        String micCode = text(row.get("mic_code"), "");
                        return MockInvestDto.StockResponse.builder()
                                .symbol(symbol)
                                .name(name)
                                .sector(!micCode.isBlank() ? micCode : exchange)
                                .description("Twelve Data KRX 전체 종목 목록입니다. 선택하면 현재가와 차트를 불러옵니다.")
                                .realtime(true)
                                .build();
                    })
                    .toList();
        } catch (Exception e) {
            throw new IllegalStateException("Twelve Data stock list request failed", e);
        }
    }

    private List<BigDecimal> twelveDataPoints(String providerSymbol) {
        try {
            Map<?, ?> data = get("/time_series?" + providerSymbol + "&interval=1day&outputsize=7");
            Object values = data != null ? data.get("values") : null;
            if (!(values instanceof List<?> rows)) return List.of();
            List<BigDecimal> result = new ArrayList<>();
            for (Object row : rows) {
                if (row instanceof Map<?, ?> map) {
                    BigDecimal close = num(map.get("close"));
                    if (close.compareTo(BigDecimal.ZERO) > 0) result.add(close);
                }
            }
            Collections.reverse(result);
            return result;
        } catch (Exception e) {
            throw new IllegalStateException("Twelve Data time series request failed", e);
        }
    }

    private Object stockRows() {
        Map<?, ?> exchangeResult = get("/stocks?exchange=KRX");
        Object exchangeRows = exchangeResult != null ? exchangeResult.get("data") : null;
        if (exchangeRows instanceof List<?> list && !list.isEmpty()) return exchangeRows;

        Map<?, ?> countryResult = get("/stocks?country=" + encode("South Korea"));
        return countryResult != null ? countryResult.get("data") : null;
    }

    private Map<?, ?> get(String path) {
        String separator = path.contains("?") ? "&" : "?";
        return restTemplate.getForObject(baseUrl + path + separator + "apikey=" + encode(apiKey), Map.class);
    }

    private String normalizeSymbol(String symbol) {
        String value = symbol == null ? "005930" : symbol.trim().toUpperCase(Locale.ROOT);
        int suffixIndex = value.indexOf(":");
        return suffixIndex > 0 ? value.substring(0, suffixIndex) : value;
    }

    private String symbolQuery(String symbol) {
        String query = "symbol=" + encode(symbol);
        return symbol.matches("\\d{6}") ? query + "&exchange=KRX" : query;
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String text(Object value, String fallback) {
        String text = value == null ? "" : String.valueOf(value).trim();
        return text.isBlank() ? fallback : text;
    }

    private BigDecimal firstNumber(Object primary, Object fallback) {
        BigDecimal first = num(primary);
        return first.compareTo(BigDecimal.ZERO) != 0 ? first : num(fallback);
    }

    private BigDecimal num(Object value) {
        if (value == null) return BigDecimal.ZERO;
        String s = String.valueOf(value).replace(",", "").trim();
        if (s.isBlank()) return BigDecimal.ZERO;
        return new BigDecimal(s);
    }

}
