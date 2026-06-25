package com.playground.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;

@Component
public class JwtUtil {

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    // 액세스 토큰: 1시간
    private static final long ACCESS_TOKEN_EXPIRY_MS = 60 * 60 * 1000L;

    // 리프레시 토큰: 7일
    private static final long REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000L;

    private SecretKey getKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 액세스 토큰 발급 (유효기간 1시간)
     */
    public String generateAccessToken(String userId, String login, String name, String avatarUrl) {
        return Jwts.builder()
                .claims(Map.of(
                        "id", userId,
                        "login", login != null ? login : "",
                        "name", name != null ? name : "",
                        "avatar_url", avatarUrl != null ? avatarUrl : "",
                        "type", "access"
                ))
                .subject(userId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + ACCESS_TOKEN_EXPIRY_MS))
                .signWith(getKey())
                .compact();
    }

    /**
     * 리프레시 토큰 발급 (유효기간 7일)
     */
    public String generateRefreshToken(String userId) {
        return Jwts.builder()
                .claims(Map.of(
                        "id", userId,
                        "type", "refresh"
                ))
                .subject(userId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + REFRESH_TOKEN_EXPIRY_MS))
                .signWith(getKey())
                .compact();
    }

    /**
     * 토큰 파싱 (Claims 반환)
     */
    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(getKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * 토큰 유효성 검증
     */
    public boolean isValid(String token) {
        try {
            parseToken(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 토큰 타입 확인 ("access" | "refresh")
     */
    public String getTokenType(String token) {
        try {
            return parseToken(token).get("type", String.class);
        } catch (Exception e) {
            return null;
        }
    }

    public long getAccessTokenExpiryMs() {
        return ACCESS_TOKEN_EXPIRY_MS;
    }

    public long getRefreshTokenExpiryMs() {
        return REFRESH_TOKEN_EXPIRY_MS;
    }
}
