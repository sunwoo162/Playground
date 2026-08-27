package com.playground.domain.bouquetauth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;

@Service
public class BouquetTokenService {

    private static final long SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000L;
    private static final long ACCESS_EXPIRY_MS = 60 * 60 * 1000L;

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    @PostConstruct
    void validateSecret() {
        if (jwtSecret == null || jwtSecret.length() < 32 || jwtSecret.contains("playground-jwt-secret-2024")) {
            throw new IllegalStateException("JWT_SECRET must be set to a private value with at least 32 characters.");
        }
    }

    public String generateSessionToken(String accountId, String email, String displayName) {
        return buildToken(accountId, SESSION_EXPIRY_MS, Map.of(
                "id", accountId,
                "email", email,
                "name", displayName,
                "type", "bouquet_session"
        ));
    }

    public String generateAccessToken(String accountId, String clientId, String email, String displayName) {
        return buildToken(accountId, ACCESS_EXPIRY_MS, Map.of(
                "id", accountId,
                "client_id", clientId,
                "email", email,
                "name", displayName,
                "type", "bouquet_access"
        ));
    }

    public Claims parseSessionToken(String token) {
        Claims claims = parse(token);
        if (!"bouquet_session".equals(claims.get("type", String.class))) {
            throw new IllegalArgumentException("invalid bouquet session token");
        }
        return claims;
    }

    public Claims parseAccessToken(String token) {
        Claims claims = parse(token);
        if (!"bouquet_access".equals(claims.get("type", String.class))) {
            throw new IllegalArgumentException("invalid bouquet access token");
        }
        return claims;
    }

    public long getSessionExpiryMs() {
        return SESSION_EXPIRY_MS;
    }

    public long getAccessExpiryMs() {
        return ACCESS_EXPIRY_MS;
    }

    private String buildToken(String subject, long expiryMs, Map<String, Object> claims) {
        return Jwts.builder()
                .claims(claims)
                .subject(subject)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expiryMs))
                .signWith(key())
                .compact();
    }

    private Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey key() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }
}
