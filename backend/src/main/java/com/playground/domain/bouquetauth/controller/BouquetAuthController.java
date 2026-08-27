package com.playground.domain.bouquetauth.controller;

import com.playground.domain.bouquetauth.service.BouquetAuthService;
import com.playground.domain.bouquetauth.service.BouquetAuthService.AccountView;
import com.playground.domain.bouquetauth.service.BouquetAuthService.BouquetAuthException;
import com.playground.domain.bouquetauth.service.BouquetAuthService.SessionResult;
import com.playground.domain.bouquetauth.service.BouquetAuthService.TokenResult;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/bouquet")
@RequiredArgsConstructor
public class BouquetAuthController {

    public static final String SESSION_COOKIE = "bouquet_session";

    private final BouquetAuthService authService;

    @PostMapping("/auth/signup")
    public ResponseEntity<?> signUp(@RequestBody SignUpRequest request, HttpServletResponse response) {
        SessionResult result = authService.signUp(request.email(), request.password(), request.displayName());
        setSessionCookie(response, result);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("user", result.account()));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletResponse response) {
        SessionResult result = authService.login(request.email(), request.password());
        setSessionCookie(response, result);
        return ResponseEntity.ok(Map.of("user", result.account()));
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<?> logout(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(SESSION_COOKIE, "")
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/auth/me")
    public ResponseEntity<?> me(HttpServletRequest request) {
        AccountView account = authService.resolveSession(extractCookie(request, SESSION_COOKIE)).orElse(null);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user", account);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/oauth/authorize")
    public ResponseEntity<Void> authorize(
            HttpServletRequest request,
            @RequestParam("client_id") String clientId,
            @RequestParam("redirect_uri") String redirectUri,
            @RequestParam String state,
            @RequestParam("code_challenge") String codeChallenge,
            @RequestParam(name = "code_challenge_method", defaultValue = "S256") String codeChallengeMethod
    ) {
        String location = authService.authorize(
                extractCookie(request, SESSION_COOKIE),
                clientId,
                redirectUri,
                state,
                codeChallenge,
                codeChallengeMethod
        );
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(location)).build();
    }

    @PostMapping("/oauth/token")
    public ResponseEntity<?> token(@RequestBody TokenRequest request) {
        TokenResult result = authService.exchangeCode(
                request.clientId(),
                request.code(),
                request.redirectUri(),
                request.codeVerifier()
        );
        return ResponseEntity.ok(Map.of(
                "access_token", result.accessToken(),
                "token_type", result.tokenType(),
                "expires_in", result.expiresInSeconds()
        ));
    }

    @GetMapping("/oauth/userinfo")
    public ResponseEntity<?> userInfo(@RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        String token = bearerToken(authorization);
        AccountView account = authService.userInfo(token);
        return ResponseEntity.ok(Map.of(
                "sub", account.id(),
                "email", account.email(),
                "name", account.displayName()
        ));
    }

    @ExceptionHandler(BouquetAuthException.class)
    public ResponseEntity<?> handleAuthException(BouquetAuthException exception) {
        String error = exception.getMessage();
        HttpStatus status = switch (error) {
            case "login_required", "invalid_credentials", "invalid_token" -> HttpStatus.UNAUTHORIZED;
            case "email_already_registered" -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_REQUEST;
        };
        return ResponseEntity.status(status).body(Map.of("error", error));
    }

    private void setSessionCookie(HttpServletResponse response, SessionResult result) {
        ResponseCookie cookie = ResponseCookie.from(SESSION_COOKIE, result.sessionToken())
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(result.expiresInSeconds())
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private String extractCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        return Arrays.stream(request.getCookies())
                .filter(cookie -> name.equals(cookie.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private String bearerToken(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new BouquetAuthException("invalid_token");
        }
        String token = authorization.substring(7).trim();
        if (token.isEmpty()) throw new BouquetAuthException("invalid_token");
        return token;
    }

    public record SignUpRequest(String email, String password, String displayName) {}
    public record LoginRequest(String email, String password) {}
    public record TokenRequest(String clientId, String code, String redirectUri, String codeVerifier) {}
}
