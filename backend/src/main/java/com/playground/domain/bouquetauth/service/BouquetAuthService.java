package com.playground.domain.bouquetauth.service;

import com.playground.domain.bouquetauth.entity.BouquetAccount;
import com.playground.domain.bouquetauth.entity.BouquetAuthorizationCode;
import com.playground.domain.bouquetauth.entity.BouquetOAuthClient;
import com.playground.domain.bouquetauth.repository.BouquetAccountRepository;
import com.playground.domain.bouquetauth.repository.BouquetAuthorizationCodeRepository;
import com.playground.domain.bouquetauth.repository.BouquetOAuthClientRepository;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class BouquetAuthService {

    private static final int AUTHORIZATION_CODE_BYTES = 32;
    private static final int AUTHORIZATION_CODE_TTL_MINUTES = 5;
    private static final String PKCE_CHALLENGE_PATTERN = "[A-Za-z0-9_-]{43}";
    private static final String PKCE_VERIFIER_PATTERN = "[A-Za-z0-9._~-]{43,128}";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final BouquetAccountRepository accountRepository;
    private final BouquetOAuthClientRepository clientRepository;
    private final BouquetAuthorizationCodeRepository authorizationCodeRepository;
    private final BouquetTokenService tokenService;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder(12);

    @Transactional
    public SessionResult signUp(String email, String password, String displayName) {
        String normalizedEmail = normalizeEmail(email);
        validatePassword(password);
        String normalizedName = normalizeDisplayName(displayName);

        if (accountRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new BouquetAuthException("email_already_registered");
        }

        BouquetAccount account = BouquetAccount.builder()
                .id(UUID.randomUUID().toString())
                .email(normalizedEmail)
                .displayName(normalizedName)
                .passwordHash(passwordEncoder.encode(password))
                .lastLoginAt(LocalDateTime.now())
                .build();
        accountRepository.save(account);
        return session(account);
    }

    @Transactional
    public SessionResult login(String email, String password) {
        String normalizedEmail = normalizeEmail(email);
        BouquetAccount account = accountRepository.findByEmailIgnoreCase(normalizedEmail)
                .orElseThrow(() -> new BouquetAuthException("invalid_credentials"));

        if (password == null || !passwordEncoder.matches(password, account.getPasswordHash())) {
            throw new BouquetAuthException("invalid_credentials");
        }

        account.setLastLoginAt(LocalDateTime.now());
        accountRepository.save(account);
        return session(account);
    }

    public Optional<AccountView> resolveSession(String sessionToken) {
        if (sessionToken == null || sessionToken.isBlank()) {
            return Optional.empty();
        }
        try {
            Claims claims = tokenService.parseSessionToken(sessionToken);
            String accountId = claims.getSubject();
            return accountRepository.findById(accountId).map(AccountView::from);
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    @Transactional
    public String authorize(
            String sessionToken,
            String clientId,
            String redirectUri,
            String state,
            String codeChallenge,
            String codeChallengeMethod
    ) {
        AccountView account = resolveSession(sessionToken)
                .orElseThrow(() -> new BouquetAuthException("login_required"));

        if (state == null || state.isBlank()) {
            throw new BouquetAuthException("state_required");
        }
        if (!"S256".equals(codeChallengeMethod)
                || codeChallenge == null
                || !codeChallenge.matches(PKCE_CHALLENGE_PATTERN)) {
            throw new BouquetAuthException("pkce_s256_required");
        }

        BouquetOAuthClient client = requireClient(clientId, redirectUri);
        String rawCode = randomCode();

        authorizationCodeRepository.save(BouquetAuthorizationCode.builder()
                .codeHash(sha256Hex(rawCode))
                .accountId(account.id())
                .clientId(client.getClientId())
                .redirectUri(client.getRedirectUri())
                .codeChallenge(codeChallenge)
                .expiresAt(LocalDateTime.now().plusMinutes(AUTHORIZATION_CODE_TTL_MINUTES))
                .build());

        return UriComponentsBuilder.fromUriString(client.getRedirectUri())
                .queryParam("code", rawCode)
                .queryParam("state", state)
                .build()
                .encode()
                .toUriString();
    }

    @Transactional
    public TokenResult exchangeCode(
            String clientId,
            String code,
            String redirectUri,
            String codeVerifier
    ) {
        requireClient(clientId, redirectUri);
        if (code == null || code.isBlank()
                || codeVerifier == null
                || !codeVerifier.matches(PKCE_VERIFIER_PATTERN)) {
            throw new BouquetAuthException("invalid_grant");
        }

        BouquetAuthorizationCode authorizationCode = authorizationCodeRepository.findByCodeHashForUpdate(sha256Hex(code))
                .orElseThrow(() -> new BouquetAuthException("invalid_grant"));

        LocalDateTime now = LocalDateTime.now();
        if (authorizationCode.getUsedAt() != null
                || authorizationCode.getExpiresAt().isBefore(now)
                || !clientId.equals(authorizationCode.getClientId())
                || !redirectUri.equals(authorizationCode.getRedirectUri())
                || !constantTimeEquals(pkceChallenge(codeVerifier), authorizationCode.getCodeChallenge())) {
            throw new BouquetAuthException("invalid_grant");
        }

        BouquetAccount account = accountRepository.findById(authorizationCode.getAccountId())
                .orElseThrow(() -> new BouquetAuthException("invalid_grant"));

        authorizationCode.setUsedAt(now);
        authorizationCodeRepository.save(authorizationCode);

        String accessToken = tokenService.generateAccessToken(
                account.getId(),
                clientId,
                account.getEmail(),
                account.getDisplayName()
        );
        return new TokenResult(accessToken, "Bearer", tokenService.getAccessExpiryMs() / 1000);
    }

    public AccountView userInfo(String bearerToken) {
        if (bearerToken == null || bearerToken.isBlank()) {
            throw new BouquetAuthException("invalid_token");
        }
        try {
            Claims claims = tokenService.parseAccessToken(bearerToken);
            String accountId = claims.getSubject();
            return accountRepository.findById(accountId)
                    .map(AccountView::from)
                    .orElseThrow(() -> new BouquetAuthException("invalid_token"));
        } catch (BouquetAuthException e) {
            throw e;
        } catch (Exception e) {
            throw new BouquetAuthException("invalid_token");
        }
    }

    @Transactional
    public BouquetOAuthClient registerClient(String clientId, String displayName, String redirectUri) {
        if (clientId == null || !clientId.matches("[A-Za-z0-9._-]{8,64}")) {
            throw new BouquetAuthException("invalid_client_id");
        }
        validateRedirectUri(redirectUri);
        String name = normalizeDisplayName(displayName);

        BouquetOAuthClient client = clientRepository.findById(clientId)
                .orElseGet(() -> BouquetOAuthClient.builder().clientId(clientId).build());
        client.setDisplayName(name);
        client.setRedirectUri(redirectUri);
        client.setActive(true);
        return clientRepository.save(client);
    }

    private BouquetOAuthClient requireClient(String clientId, String redirectUri) {
        BouquetOAuthClient client = clientRepository.findByClientIdAndActiveTrue(clientId)
                .orElseThrow(() -> new BouquetAuthException("invalid_client"));
        if (redirectUri == null || !client.getRedirectUri().equals(redirectUri)) {
            throw new BouquetAuthException("invalid_redirect_uri");
        }
        return client;
    }

    private SessionResult session(BouquetAccount account) {
        String token = tokenService.generateSessionToken(account.getId(), account.getEmail(), account.getDisplayName());
        return new SessionResult(token, tokenService.getSessionExpiryMs() / 1000, AccountView.from(account));
    }

    private static String normalizeEmail(String email) {
        if (email == null) throw new BouquetAuthException("invalid_email");
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > 320 || !normalized.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new BouquetAuthException("invalid_email");
        }
        return normalized;
    }

    private static void validatePassword(String password) {
        if (password == null || password.length() < 8 || password.length() > 128) {
            throw new BouquetAuthException("invalid_password");
        }
    }

    private static String normalizeDisplayName(String displayName) {
        if (displayName == null) throw new BouquetAuthException("invalid_display_name");
        String normalized = displayName.trim();
        if (normalized.length() < 2 || normalized.length() > 100) {
            throw new BouquetAuthException("invalid_display_name");
        }
        return normalized;
    }

    private static void validateRedirectUri(String redirectUri) {
        try {
            URI uri = URI.create(redirectUri);
            boolean https = "https".equalsIgnoreCase(uri.getScheme());
            boolean localHttp = "http".equalsIgnoreCase(uri.getScheme())
                    && ("localhost".equalsIgnoreCase(uri.getHost()) || "127.0.0.1".equals(uri.getHost()));
            if ((!https && !localHttp) || uri.getHost() == null || uri.getFragment() != null || uri.getUserInfo() != null) {
                throw new BouquetAuthException("invalid_redirect_uri");
            }
        } catch (BouquetAuthException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            throw new BouquetAuthException("invalid_redirect_uri");
        }
    }

    static String pkceChallenge(String verifier) {
        byte[] digest = sha256(verifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }

    private static String randomCode() {
        byte[] bytes = new byte[AUTHORIZATION_CODE_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256Hex(String value) {
        return HexFormat.of().formatHex(sha256(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static byte[] sha256(byte[] input) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(input);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    private static boolean constantTimeEquals(String left, String right) {
        if (left == null || right == null) return false;
        return MessageDigest.isEqual(left.getBytes(StandardCharsets.US_ASCII), right.getBytes(StandardCharsets.US_ASCII));
    }

    public record SessionResult(String sessionToken, long expiresInSeconds, AccountView account) {}
    public record TokenResult(String accessToken, String tokenType, long expiresInSeconds) {}
    public record AccountView(String id, String email, String displayName) {
        static AccountView from(BouquetAccount account) {
            return new AccountView(account.getId(), account.getEmail(), account.getDisplayName());
        }
    }

    public static class BouquetAuthException extends RuntimeException {
        public BouquetAuthException(String message) {
            super(message);
        }
    }
}
