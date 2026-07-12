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
    private String mock;

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
        boolean mockEnabled = mock != null && "true".equalsIgnoreCase(mock.trim());
        return !mockEnabled && !configuredApiKey().isBlank();
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
        failIfProviderError(quote, "Twelve Data quote request failed");
        if (quote == null) throw new StockProviderException("Twelve Data quote response missing");

        BigDecimal price = firstNumber(quote.get("close"), quote.get("previous_close"));
        if (price.compareTo(BigDecimal.ZERO) == 0) throw new StockProviderException("Twelve Data quote price missing");

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
                .sector(text(quote.get("exchange"), "US"))
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
                        return symbol.matches("[A-Z.\\-]{1,12}")
                                && (keyword.isBlank()
                                || symbol.toLowerCase().contains(keyword)
                                || name.toLowerCase().contains(keyword));
                    })
                    .limit(keyword.isBlank() ? 500 : 80)
                    .map(row -> {
                        String symbol = normalizeSymbol(text(row.get("symbol"), ""));
                        String name = text(row.get("name"), symbol);
                        String exchange = text(row.get("exchange"), "US");
                        String micCode = text(row.get("mic_code"), "");
                        return MockInvestDto.StockResponse.builder()
                                .symbol(symbol)
                                .name(name)
                                .sector(!micCode.isBlank() ? micCode : exchange)
                                .description("Twelve Data 미국 종목 목록입니다. 선택하면 현재가와 차트를 불러옵니다.")
                                .realtime(true)
                                .build();
                    })
                    .toList();
        } catch (StockProviderException e) {
            throw e;
        } catch (Exception e) {
            throw new StockProviderException("Twelve Data stock list request failed", e);
        }
    }

    private List<BigDecimal> twelveDataPoints(String providerSymbol) {
        try {
            Map<?, ?> data = get("/time_series?" + providerSymbol + "&interval=1day&outputsize=7");
            failIfProviderError(data, "Twelve Data time series request failed");
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
        } catch (StockProviderException e) {
            throw e;
        } catch (Exception e) {
            throw new StockProviderException("Twelve Data time series request failed", e);
        }
    }

    private Object stockRows() {
        Map<?, ?> countryResult = get("/stocks?country=" + encode("United States"));
        failIfProviderError(countryResult, "Twelve Data stock list request failed");
        return countryResult != null ? countryResult.get("data") : null;
    }

    private Map<?, ?> get(String path) {
        String separator = path.contains("?") ? "&" : "?";
        return restTemplate.getForObject(baseUrl + path + separator + "apikey=" + encode(configuredApiKey()), Map.class);
    }

    private String configuredApiKey() {
        String value = apiKey != null ? apiKey.trim() : "";
        if (!value.isBlank()) return value;
        String envValue = System.getenv("TWELVE_DATA_API_KEY");
        return envValue != null ? envValue.trim() : "";
    }

    private String normalizeSymbol(String symbol) {
        String value = symbol == null ? "AAPL" : symbol.trim().toUpperCase(Locale.ROOT);
        int suffixIndex = value.indexOf(":");
        return suffixIndex > 0 ? value.substring(0, suffixIndex) : value;
    }

    private String symbolQuery(String symbol) {
        return "symbol=" + encode(symbol);
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

    private void failIfProviderError(Map<?, ?> body, String fallback) {
        if (body == null) return;
        Object status = body.get("status");
        if (status != null && "error".equals(String.valueOf(status))) {
            Object code = body.get("code");
            Object message = body.get("message");
            String detail = message != null ? String.valueOf(message) : fallback;
            throw new StockProviderException(code != null ? "Twelve Data " + code + ": " + detail : detail);
        }
    }

}
