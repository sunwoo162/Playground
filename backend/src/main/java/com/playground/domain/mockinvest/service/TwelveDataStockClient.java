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
        return twelveDataStocks(q);
    }

    public MockInvestDto.StockResponse quote(String symbol) {
        String normalizedSymbol = normalizeSymbol(symbol);
        if (!canUseTwelveData()) {
            return fallbackQuote(normalizedSymbol);
        }
        try {
            return twelveDataQuote(normalizedSymbol);
        } catch (StockProviderException e) {
            return fallbackQuote(normalizedSymbol);
        } catch (RuntimeException e) {
            return fallbackQuote(normalizedSymbol);
        }
    }

    public List<MockInvestDto.ChartCandleResponse> chart(String symbol, String range) {
        String normalizedSymbol = normalizeSymbol(symbol);
        ChartQuery chartQuery = chartQuery(range);
        if (!canUseTwelveData()) {
            return fallbackCandles(normalizedSymbol, chartQuery.outputSize(), chartQuery.range());
        }
        try {
            return twelveDataChart(normalizedSymbol, chartQuery);
        } catch (RuntimeException e) {
            return fallbackCandles(normalizedSymbol, chartQuery.outputSize(), chartQuery.range());
        }
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
        Map<?, ?> quote = null;
        String providerQuery = "";
        StockProviderException lastError = null;
        for (String query : symbolQueries(normalizedSymbol)) {
            try {
                Map<?, ?> candidate = get("/quote?" + query);
                failIfProviderError(candidate, "Twelve Data quote request failed");
                quote = candidate;
                providerQuery = query;
                break;
            } catch (StockProviderException e) {
                lastError = e;
            }
        }
        if (quote == null) {
            if (lastError != null) throw lastError;
            throw new StockProviderException("Twelve Data quote response missing");
        }

        BigDecimal price = firstNumber(quote.get("close"), quote.get("previous_close"));
        if (price.compareTo(BigDecimal.ZERO) == 0) throw new StockProviderException("Twelve Data quote price missing");

        BigDecimal change = num(quote.get("change"));
        BigDecimal changeRate = num(quote.get("percent_change"));
        List<BigDecimal> pointValues = twelveDataPoints(providerQuery);
        if (pointValues.isEmpty()) pointValues = fallbackPoints(price);
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
                            .price(fallbackPrice(stock.symbol()))
                            .change(BigDecimal.ZERO)
                            .changeRate(BigDecimal.ZERO)
                            .volume(0L)
                            .marketCap(BigDecimal.ZERO)
                            .sector(stock.sector())
                            .description("주요 미국 종목입니다. 선택하면 Twelve Data 현재가와 차트를 불러옵니다.")
                            .high(fallbackPrice(stock.symbol()).multiply(BigDecimal.valueOf(1.01)))
                            .low(fallbackPrice(stock.symbol()).multiply(BigDecimal.valueOf(0.99)))
                            .points(fallbackPoints(fallbackPrice(stock.symbol())))
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

    private List<MockInvestDto.ChartCandleResponse> twelveDataChart(String symbol, ChartQuery chartQuery) {
        Map<?, ?> data = null;
        StockProviderException lastError = null;
        for (String query : symbolQueries(symbol)) {
            try {
                Map<?, ?> candidate = get("/time_series?" + query
                        + "&interval=" + encode(chartQuery.interval())
                        + "&outputsize=" + chartQuery.outputSize());
                failIfProviderError(candidate, "Twelve Data time series request failed");
                data = candidate;
                break;
            } catch (StockProviderException e) {
                lastError = e;
            }
        }
        if (data == null && lastError != null) throw lastError;
        Object values = data != null ? data.get("values") : null;
        if (!(values instanceof List<?> rows) || rows.isEmpty()) {
            throw new StockProviderException("Twelve Data chart response missing");
        }
        List<MockInvestDto.ChartCandleResponse> result = new ArrayList<>();
        for (Object row : rows) {
            if (row instanceof Map<?, ?> map) {
                BigDecimal close = num(map.get("close"));
                if (close.compareTo(BigDecimal.ZERO) <= 0) continue;
                result.add(MockInvestDto.ChartCandleResponse.builder()
                        .datetime(text(map.get("datetime"), ""))
                        .open(firstNumber(map.get("open"), close))
                        .high(firstNumber(map.get("high"), close))
                        .low(firstNumber(map.get("low"), close))
                        .close(close)
                        .volume(num(map.get("volume")).longValue())
                        .realtime(true)
                        .build());
            }
        }
        Collections.reverse(result);
        if (result.isEmpty()) {
            throw new StockProviderException("Twelve Data chart values missing");
        }
        return result;
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
        String exchange = POPULAR_STOCKS.stream()
                .filter(stock -> stock.symbol().equals(symbol))
                .map(StockSeed::exchange)
                .findFirst()
                .orElse("");
        String query = "symbol=" + encode(symbol);
        return exchange.isBlank() ? query : query + "&exchange=" + encode(exchange);
    }

    private List<String> symbolQueries(String symbol) {
        String exchangeQuery = symbolQuery(symbol);
        String symbolOnlyQuery = "symbol=" + encode(symbol);
        if (exchangeQuery.equals(symbolOnlyQuery)) return List.of(symbolOnlyQuery);
        return List.of(exchangeQuery, symbolOnlyQuery);
    }

    private ChartQuery chartQuery(String range) {
        String value = range == null ? "1D" : range.trim().toUpperCase(Locale.ROOT);
        return switch (value) {
            case "5Y" -> new ChartQuery("5Y", "1month", 60);
            case "1Y" -> new ChartQuery("1Y", "1week", 52);
            case "6M" -> new ChartQuery("6M", "1week", 26);
            case "1M" -> new ChartQuery("1M", "1day", 30);
            case "1W" -> new ChartQuery("1W", "1day", 7);
            default -> new ChartQuery("1D", "5min", 78);
        };
    }

    private MockInvestDto.StockResponse fallbackQuote(String symbol) {
        BigDecimal price = fallbackPrice(symbol);
        BigDecimal change = fallbackChange(symbol);
        BigDecimal changeRate = price.compareTo(BigDecimal.ZERO) > 0
                ? change.multiply(BigDecimal.valueOf(100)).divide(price.subtract(change), 2, java.math.RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        return MockInvestDto.StockResponse.builder()
                .symbol(symbol)
                .name(koreanName(symbol, symbol))
                .price(price)
                .change(change)
                .changeRate(changeRate)
                .volume(fallbackVolume(symbol))
                .marketCap(BigDecimal.ZERO)
                .sector(fallbackSector(symbol))
                .high(price.multiply(BigDecimal.valueOf(1.01)))
                .low(price.multiply(BigDecimal.valueOf(0.99)))
                .description("Twelve Data 시세를 불러오지 못해 주요 종목 예비 시세로 표시합니다.")
                .points(fallbackPoints(price))
                .realtime(false)
                .build();
    }

    private List<MockInvestDto.ChartCandleResponse> fallbackCandles(String symbol, int count, String range) {
        BigDecimal closePrice = fallbackPrice(symbol);
        BigDecimal changeRate = fallbackQuote(symbol).getChangeRate();
        BigDecimal multiplier = switch (range) {
            case "5Y" -> BigDecimal.valueOf(60);
            case "1Y" -> BigDecimal.valueOf(30);
            case "6M" -> BigDecimal.valueOf(18);
            case "1M" -> BigDecimal.valueOf(8);
            case "1W" -> BigDecimal.valueOf(3);
            default -> BigDecimal.ONE;
        };
        BigDecimal periodRate = changeRate.multiply(multiplier).max(BigDecimal.valueOf(-85)).min(BigDecimal.valueOf(220));
        BigDecimal startPrice = closePrice.divide(BigDecimal.ONE.add(periodRate.divide(BigDecimal.valueOf(100), 8, java.math.RoundingMode.HALF_UP)), 4, java.math.RoundingMode.HALF_UP);
        BigDecimal previousClose = startPrice;
        BigDecimal movementBase = closePrice.subtract(startPrice).abs().add(closePrice.multiply(BigDecimal.valueOf(0.015)));
        long baseVolume = fallbackVolume(symbol);
        List<MockInvestDto.ChartCandleResponse> result = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            BigDecimal ratio = count <= 1 ? BigDecimal.ONE : BigDecimal.valueOf(i).divide(BigDecimal.valueOf(count - 1), 8, java.math.RoundingMode.HALF_UP);
            BigDecimal trendClose = startPrice.add(closePrice.subtract(startPrice).multiply(ratio));
            BigDecimal noise = i == 0 || i == count - 1
                    ? BigDecimal.ZERO
                    : movementBase.multiply(BigDecimal.valueOf(Math.sin((i + Math.abs(symbol.hashCode() % 13)) * 1.37) * 0.16));
            BigDecimal close = i == count - 1 ? closePrice : trendClose.add(noise).max(BigDecimal.valueOf(0.01));
            BigDecimal spread = close.max(previousClose).multiply(BigDecimal.valueOf(0.01));
            result.add(MockInvestDto.ChartCandleResponse.builder()
                    .datetime("")
                    .open(previousClose)
                    .high(close.max(previousClose).add(spread))
                    .low(close.min(previousClose).subtract(spread).max(BigDecimal.valueOf(0.01)))
                    .close(close)
                    .volume(Math.round(baseVolume * (0.35 + Math.abs(Math.sin(i * 1.7)) * 0.65)))
                    .realtime(false)
                    .build());
            previousClose = close;
        }
        return result;
    }

    private BigDecimal fallbackPrice(String symbol) {
        return switch (symbol) {
            case "AAPL" -> BigDecimal.valueOf(230.56);
            case "MSFT" -> BigDecimal.valueOf(503.32);
            case "NVDA" -> BigDecimal.valueOf(164.92);
            case "GOOGL" -> BigDecimal.valueOf(181.42);
            case "UBER" -> BigDecimal.valueOf(94.18);
            case "AMZN" -> BigDecimal.valueOf(222.69);
            case "META" -> BigDecimal.valueOf(717.51);
            case "TSLA" -> BigDecimal.valueOf(313.51);
            case "AVGO" -> BigDecimal.valueOf(275.12);
            case "COST" -> BigDecimal.valueOf(982.35);
            case "NFLX" -> BigDecimal.valueOf(1231.87);
            case "AMD" -> BigDecimal.valueOf(146.41);
            case "INTC" -> BigDecimal.valueOf(22.83);
            case "QCOM" -> BigDecimal.valueOf(158.02);
            case "PEP" -> BigDecimal.valueOf(132.44);
            case "ADBE" -> BigDecimal.valueOf(374.91);
            case "CSCO" -> BigDecimal.valueOf(68.35);
            case "ORCL" -> BigDecimal.valueOf(241.28);
            case "CRM" -> BigDecimal.valueOf(256.77);
            case "IBM" -> BigDecimal.valueOf(283.04);
            case "JPM" -> BigDecimal.valueOf(290.13);
            case "V" -> BigDecimal.valueOf(349.19);
            case "MA" -> BigDecimal.valueOf(565.73);
            case "WMT" -> BigDecimal.valueOf(97.42);
            case "MCD" -> BigDecimal.valueOf(295.31);
            case "KO" -> BigDecimal.valueOf(69.16);
            case "DIS" -> BigDecimal.valueOf(120.37);
            case "NKE" -> BigDecimal.valueOf(72.84);
            case "BA" -> BigDecimal.valueOf(229.67);
            case "XOM" -> BigDecimal.valueOf(113.94);
            default -> BigDecimal.valueOf(100);
        };
    }

    private BigDecimal fallbackChange(String symbol) {
        int bucket = Math.abs(symbol.hashCode() % 9) - 4;
        return BigDecimal.valueOf(bucket).multiply(BigDecimal.valueOf(0.37));
    }

    private long fallbackVolume(String symbol) {
        return 1_000_000L + Math.abs(symbol.hashCode() % 18_000_000);
    }

    private String fallbackSector(String symbol) {
        return POPULAR_STOCKS.stream()
                .filter(stock -> stock.symbol().equals(symbol))
                .map(StockSeed::sector)
                .findFirst()
                .orElse("US");
    }

    private List<BigDecimal> fallbackPoints(BigDecimal price) {
        return List.of(
                price.multiply(BigDecimal.valueOf(0.972)),
                price.multiply(BigDecimal.valueOf(0.986)),
                price.multiply(BigDecimal.valueOf(0.981)),
                price.multiply(BigDecimal.valueOf(1.004)),
                price.multiply(BigDecimal.valueOf(0.997)),
                price.multiply(BigDecimal.valueOf(1.012)),
                price
        );
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
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
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

    private record ChartQuery(String range, String interval, int outputSize) {
    }

}
