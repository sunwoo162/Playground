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
    private static final List<StockSeed> POPULAR_STOCKS = List.of(
            new StockSeed("AAPL", "애플", "NASDAQ", "기술"),
            new StockSeed("MSFT", "마이크로소프트", "NASDAQ", "기술"),
            new StockSeed("NVDA", "엔비디아", "NASDAQ", "반도체"),
            new StockSeed("GOOGL", "구글", "NASDAQ", "인터넷"),
            new StockSeed("UBER", "우버", "NYSE", "모빌리티"),
            new StockSeed("AMZN", "아마존", "NASDAQ", "이커머스"),
            new StockSeed("META", "메타", "NASDAQ", "소셜미디어"),
            new StockSeed("TSLA", "테슬라", "NASDAQ", "전기차"),
            new StockSeed("AVGO", "브로드컴", "NASDAQ", "반도체"),
            new StockSeed("COST", "코스트코", "NASDAQ", "유통"),
            new StockSeed("NFLX", "넷플릭스", "NASDAQ", "미디어"),
            new StockSeed("AMD", "AMD", "NASDAQ", "반도체"),
            new StockSeed("INTC", "인텔", "NASDAQ", "반도체"),
            new StockSeed("QCOM", "퀄컴", "NASDAQ", "반도체"),
            new StockSeed("PEP", "펩시코", "NASDAQ", "소비재"),
            new StockSeed("ADBE", "어도비", "NASDAQ", "소프트웨어"),
            new StockSeed("CSCO", "시스코", "NASDAQ", "네트워크"),
            new StockSeed("ORCL", "오라클", "NYSE", "소프트웨어"),
            new StockSeed("CRM", "세일즈포스", "NYSE", "소프트웨어"),
            new StockSeed("IBM", "IBM", "NYSE", "기술"),
            new StockSeed("JPM", "제이피모건 체이스", "NYSE", "금융"),
            new StockSeed("V", "비자", "NYSE", "결제"),
            new StockSeed("MA", "마스터카드", "NYSE", "결제"),
            new StockSeed("WMT", "월마트", "NYSE", "유통"),
            new StockSeed("MCD", "맥도날드", "NYSE", "외식"),
            new StockSeed("KO", "코카콜라", "NYSE", "소비재"),
            new StockSeed("DIS", "디즈니", "NYSE", "미디어"),
            new StockSeed("NKE", "나이키", "NYSE", "소비재"),
            new StockSeed("BA", "보잉", "NYSE", "항공"),
            new StockSeed("XOM", "엑슨모빌", "NYSE", "에너지")
    );

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
                .name(koreanName(normalizedSymbol, text(quote.get("name"), normalizedSymbol)))
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
            return POPULAR_STOCKS.stream()
                    .filter(stock -> keyword.isBlank()
                            || stock.symbol().toLowerCase(Locale.ROOT).contains(keyword)
                            || stock.name().toLowerCase(Locale.ROOT).contains(keyword)
                            || stock.sector().toLowerCase(Locale.ROOT).contains(keyword))
                    .map(stock -> MockInvestDto.StockResponse.builder()
                            .symbol(stock.symbol())
                            .name(stock.name())
                            .sector(stock.sector())
                            .description("주요 미국 종목입니다. 선택하면 Twelve Data 현재가와 차트를 불러옵니다.")
                            .realtime(true)
                            .build())
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
            return List.of();
        } catch (Exception e) {
            return List.of();
        }
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

    private String koreanName(String symbol, String fallback) {
        return POPULAR_STOCKS.stream()
                .filter(stock -> stock.symbol().equals(symbol))
                .map(StockSeed::name)
                .findFirst()
                .orElse(fallback);
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

    private record StockSeed(String symbol, String name, String exchange, String sector) {
    }

}
