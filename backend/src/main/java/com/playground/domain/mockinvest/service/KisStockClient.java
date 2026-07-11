package com.playground.domain.mockinvest.service;

import com.playground.domain.mockinvest.dto.MockInvestDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Component
@RequiredArgsConstructor
public class KisStockClient {
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${kis.base-url:https://openapi.koreainvestment.com:9443}")
    private String baseUrl;

    @Value("${kis.app-key:}")
    private String appKey;

    @Value("${kis.app-secret:}")
    private String appSecret;

    @Value("${kis.account-no:}")
    private String accountNo;

    @Value("${kis.mock:true}")
    private boolean mock;

    private String accessToken;
    private Instant tokenExpiresAt = Instant.EPOCH;

    private static final Map<String, SampleStock> SAMPLES = Map.of(
            "005930", new SampleStock("005930", "삼성전자", "반도체", "메모리 반도체와 모바일 기기를 중심으로 글로벌 사업을 운영합니다.", 72500, 1.24),
            "000660", new SampleStock("000660", "SK하이닉스", "반도체", "DRAM과 NAND를 중심으로 AI 반도체 수요의 영향을 크게 받습니다.", 232000, 2.38),
            "035420", new SampleStock("035420", "NAVER", "플랫폼", "검색, 커머스, 콘텐츠, 클라우드 서비스를 제공하는 플랫폼 기업입니다.", 188500, -0.64),
            "035720", new SampleStock("035720", "카카오", "플랫폼", "메신저, 콘텐츠, 모빌리티, 금융 서비스를 연결하는 생활 플랫폼입니다.", 49200, -1.12),
            "005380", new SampleStock("005380", "현대차", "자동차", "완성차, 전기차, 수소차, 모빌리티 서비스를 확장하는 자동차 기업입니다.", 267500, 0.92),
            "068270", new SampleStock("068270", "셀트리온", "바이오", "바이오시밀러와 의약품 개발, 생산, 판매를 수행합니다.", 184000, 1.73)
    );

    public List<MockInvestDto.StockResponse> search(String keyword) {
        String q = keyword == null ? "" : keyword.trim().toLowerCase();
        return SAMPLES.values().stream()
                .filter(s -> q.isBlank()
                        || s.symbol().contains(q)
                        || s.name().toLowerCase().contains(q)
                        || s.sector().toLowerCase().contains(q))
                .map(s -> quote(s.symbol()))
                .toList();
    }

    public MockInvestDto.StockResponse quote(String symbol) {
        if (canUseKis()) {
            try {
                return kisQuote(symbol);
            } catch (Exception ignored) {
                // fall through to sample data
            }
        }
        return sampleQuote(symbol);
    }

    private boolean canUseKis() {
        return !mock && !appKey.isBlank() && !appSecret.isBlank();
    }

    private MockInvestDto.StockResponse kisQuote(String symbol) {
        String token = token();
        String url = baseUrl + "/uapi/domestic-stock/v1/quotations/inquire-price"
                + "?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=" + symbol;

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("appkey", appKey);
        headers.set("appsecret", appSecret);
        headers.set("tr_id", accountNo != null && accountNo.startsWith("V") ? "FHKST01010100" : "FHKST01010100");
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<Map> res = restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        Map<?, ?> body = res.getBody();
        if (body == null) throw new IllegalStateException("KIS quote response missing");
        Map<?, ?> output = (Map<?, ?>) body.get("output");
        if (output == null) throw new IllegalStateException("KIS quote output missing");

        BigDecimal price = num(output.get("stck_prpr"));
        BigDecimal change = num(output.get("prdy_vrss"));
        BigDecimal changeRate = num(output.get("prdy_ctrt"));
        SampleStock sample = SAMPLES.getOrDefault(symbol, new SampleStock(symbol, symbol, "국내주식", "한국투자증권 Open API 시세입니다.", price.longValue(), 0));

        return MockInvestDto.StockResponse.builder()
                .symbol(symbol)
                .name(sample.name())
                .price(price)
                .change(change)
                .changeRate(changeRate)
                .volume(num(output.get("acml_vol")).longValue())
                .marketCap(BigDecimal.ZERO)
                .sector(sample.sector())
                .high(num(output.get("stck_hgpr")))
                .low(num(output.get("stck_lwpr")))
                .description(sample.description())
                .points(points(price))
                .realtime(true)
                .build();
    }

    private String token() {
        if (accessToken != null && Instant.now().isBefore(tokenExpiresAt.minusSeconds(60))) {
            return accessToken;
        }

        String url = baseUrl + "/oauth2/tokenP";
        Map<String, String> body = Map.of(
                "grant_type", "client_credentials",
                "appkey", appKey,
                "appsecret", appSecret
        );
        ResponseEntity<Map> res = restTemplate.postForEntity(url, body, Map.class);
        Map<?, ?> data = res.getBody();
        if (data == null) throw new IllegalStateException("KIS token response missing");
        accessToken = String.valueOf(data.get("access_token"));
        Object expiresValue = data.get("expires_in");
        long expires = Long.parseLong(String.valueOf(expiresValue != null ? expiresValue : "86400"));
        tokenExpiresAt = Instant.now().plusSeconds(expires);
        return accessToken;
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
                .high(price.multiply(BigDecimal.valueOf("1.02")))
                .low(price.multiply(BigDecimal.valueOf("0.98")))
                .description(sample.description())
                .points(points(price))
                .realtime(false)
                .build();
    }

    private List<BigDecimal> points(BigDecimal price) {
        return List.of("0.93", "0.95", "0.97", "0.96", "0.99", "1.01", "1.00")
                .stream().map(v -> price.multiply(new BigDecimal(v))).toList();
    }

    private BigDecimal num(Object value) {
        if (value == null) return BigDecimal.ZERO;
        String s = String.valueOf(value).replace(",", "").trim();
        if (s.isBlank()) return BigDecimal.ZERO;
        return new BigDecimal(s);
    }

    private record SampleStock(String symbol, String name, String sector, String description, long price, double changeRate) {}
}
