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

    private static final Map<String, SampleStock> SAMPLES = sampleStocks();

    public List<MockInvestDto.StockResponse> search(String keyword) {
        String q = keyword == null ? "" : keyword.trim().toLowerCase();
        if (canUseTwelveData()) {
            List<MockInvestDto.StockResponse> apiStocks = twelveDataStocks(q);
            if (!apiStocks.isEmpty()) return apiStocks;
        }

        return SAMPLES.values().stream()
                .filter(s -> q.isBlank()
                        || s.symbol().contains(q)
                        || s.name().toLowerCase().contains(q)
                        || s.sector().toLowerCase().contains(q))
                .map(s -> quote(s.symbol()))
                .toList();
    }

    public MockInvestDto.StockResponse quote(String symbol) {
        if (canUseTwelveData()) {
            return twelveDataQuote(symbol);
        }
        return sampleQuote(symbol);
    }

    private boolean canUseTwelveData() {
        return !mock && apiKey != null && !apiKey.isBlank();
    }

    private MockInvestDto.StockResponse twelveDataQuote(String symbol) {
        String normalizedSymbol = normalizeSymbol(symbol);
        String providerSymbol = toProviderSymbol(normalizedSymbol);
        Map<?, ?> quote = get("/quote?symbol=" + encode(providerSymbol));
        if (quote == null || quote.get("status") != null && "error".equals(String.valueOf(quote.get("status")))) {
            throw new IllegalStateException("Twelve Data quote response missing");
        }

        BigDecimal price = firstNumber(quote.get("close"), quote.get("previous_close"));
        if (price.compareTo(BigDecimal.ZERO) == 0) throw new IllegalStateException("Twelve Data quote price missing");

        BigDecimal change = num(quote.get("change"));
        BigDecimal changeRate = num(quote.get("percent_change"));
        SampleStock sample = SAMPLES.getOrDefault(normalizedSymbol, new SampleStock(
                normalizedSymbol,
                text(quote.get("name"), normalizedSymbol),
                text(quote.get("exchange"), "국내주식"),
                "Twelve Data 실시간/지연 시세입니다.",
                price.longValue(),
                changeRate.doubleValue()
        ));

        List<BigDecimal> pointValues = twelveDataPoints(providerSymbol);
        return MockInvestDto.StockResponse.builder()
                .symbol(normalizedSymbol)
                .name(text(quote.get("name"), sample.name()))
                .price(price)
                .change(change)
                .changeRate(changeRate)
                .volume(num(quote.get("volume")).longValue())
                .marketCap(BigDecimal.ZERO)
                .sector(sample.sector())
                .high(firstNumber(quote.get("high"), price))
                .low(firstNumber(quote.get("low"), price))
                .description(sample.description())
                .points(pointValues.isEmpty() ? points(price) : pointValues)
                .realtime(true)
                .build();
    }

    private MockInvestDto.StockResponse sampleQuote(String symbol) {
        SampleStock sample = SAMPLES.getOrDefault(symbol, SAMPLES.get("005930"));
        BigDecimal price = BigDecimal.valueOf(sample.price());
        BigDecimal changeRate = BigDecimal.valueOf(sample.changeRate());
        BigDecimal change = price.multiply(changeRate).divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        return MockInvestDto.StockResponse.builder()
                .symbol(sample.symbol())
                .name(sample.name())
                .price(price)
                .change(change)
                .changeRate(changeRate)
                .volume(1_000_000L + Math.abs(sample.symbol().hashCode() % 9_000_000))
                .marketCap(price.multiply(BigDecimal.valueOf(1_000_000_000L)))
                .sector(sample.sector())
                .high(price.multiply(new BigDecimal("1.02")))
                .low(price.multiply(new BigDecimal("0.98")))
                .description(sample.description())
                .points(points(price))
                .realtime(false)
                .build();
    }

    private List<BigDecimal> points(BigDecimal price) {
        return List.of("0.93", "0.95", "0.97", "0.96", "0.99", "1.01", "1.00")
                .stream().map(v -> price.multiply(new BigDecimal(v))).toList();
    }

    private List<MockInvestDto.StockResponse> twelveDataStocks(String keyword) {
        try {
            Map<?, ?> data = get("/stocks?exchange=KRX");
            Object rows = data != null ? data.get("data") : null;
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
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private List<BigDecimal> twelveDataPoints(String providerSymbol) {
        try {
            Map<?, ?> data = get("/time_series?symbol=" + encode(providerSymbol) + "&interval=1day&outputsize=7");
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
        } catch (Exception ignored) {
            return List.of();
        }
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

    private String toProviderSymbol(String symbol) {
        return symbol.matches("\\d{6}") ? symbol + ":KRX" : symbol;
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

    private static Map<String, SampleStock> sampleStocks() {
        Map<String, SampleStock> stocks = new LinkedHashMap<>();
        stocks.put("005930", new SampleStock("005930", "삼성전자", "반도체", "메모리 반도체와 모바일 기기를 중심으로 글로벌 사업을 운영합니다.", 72500, 1.24));
        stocks.put("000660", new SampleStock("000660", "SK하이닉스", "반도체", "DRAM과 NAND를 중심으로 AI 반도체 수요의 영향을 크게 받습니다.", 232000, 2.38));
        stocks.put("373220", new SampleStock("373220", "LG에너지솔루션", "2차전지", "전기차 배터리와 에너지 저장장치 배터리를 생산합니다.", 358000, -0.42));
        stocks.put("207940", new SampleStock("207940", "삼성바이오로직스", "바이오", "바이오 의약품 위탁개발생산을 수행합니다.", 812000, 0.71));
        stocks.put("005380", new SampleStock("005380", "현대차", "자동차", "완성차, 전기차, 수소차, 모빌리티 서비스를 확장하는 자동차 기업입니다.", 267500, 0.92));
        stocks.put("000270", new SampleStock("000270", "기아", "자동차", "글로벌 완성차와 친환경차 라인업을 운영합니다.", 118500, 1.06));
        stocks.put("068270", new SampleStock("068270", "셀트리온", "바이오", "바이오시밀러와 의약품 개발, 생산, 판매를 수행합니다.", 184000, 1.73));
        stocks.put("105560", new SampleStock("105560", "KB금융", "금융", "은행, 증권, 보험 등 금융 서비스를 제공하는 금융지주입니다.", 85400, 0.36));
        stocks.put("055550", new SampleStock("055550", "신한지주", "금융", "은행과 카드, 증권, 보험을 아우르는 금융지주입니다.", 48600, -0.18));
        stocks.put("035420", new SampleStock("035420", "NAVER", "플랫폼", "검색, 커머스, 콘텐츠, 클라우드 서비스를 제공하는 플랫폼 기업입니다.", 188500, -0.64));
        stocks.put("035720", new SampleStock("035720", "카카오", "플랫폼", "메신저, 콘텐츠, 모빌리티, 금융 서비스를 연결하는 생활 플랫폼입니다.", 49200, -1.12));
        stocks.put("012330", new SampleStock("012330", "현대모비스", "자동차부품", "자동차 핵심 부품과 모듈을 공급합니다.", 246500, 0.28));
        stocks.put("066570", new SampleStock("066570", "LG전자", "전자", "가전, TV, 전장 부품 사업을 운영합니다.", 98300, -0.31));
        stocks.put("005490", new SampleStock("005490", "POSCO홀딩스", "철강", "철강과 2차전지 소재 사업을 함께 운영합니다.", 386000, 0.84));
        stocks.put("051910", new SampleStock("051910", "LG화학", "화학", "석유화학, 첨단소재, 생명과학 사업을 운영합니다.", 312000, -0.73));
        return stocks;
    }

    private record SampleStock(String symbol, String name, String sector, String description, long price, double changeRate) {}
}
