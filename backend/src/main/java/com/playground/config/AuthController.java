package com.playground.config;

import com.playground.domain.user.entity.User;
import com.playground.domain.user.repository.UserRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    /**
     * GET /api/auth/me
     * 현재 로그인된 사용자 정보 반환
     */
    @GetMapping("/me")
    public ResponseEntity<?> me() {
        var auth = SecurityContextHolder.getContext().getAuthentication();

        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            return ResponseEntity.ok(Map.of("user", jwtAuth.getAttributes()));
        }
        return ResponseEntity.ok(Map.of("user", (Object) null));
    }

    /**
     * POST /api/auth/refresh
     * 리프레시 토큰으로 새 액세스 토큰 발급
     *
     * 쿠키에서 playground_refresh 토큰을 읽어
     * 유효하면 새 playground_token(액세스)을 쿠키로 내려줌
     *
     * Refresh Token payload에는 id만 포함되어 있으므로
     * DB에서 유저 정보를 조회해서 Access Token을 발급함
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request, HttpServletResponse response) {
        String refreshToken = extractCookie(request, "playground_refresh");

        if (refreshToken == null) {
            return ResponseEntity.status(401).body(Map.of("error", "no_refresh_token"));
        }

        if (!jwtUtil.isValid(refreshToken) || !"refresh".equals(jwtUtil.getTokenType(refreshToken))) {
            return ResponseEntity.status(401).body(Map.of("error", "invalid_refresh_token"));
        }

        Claims claims = jwtUtil.parseToken(refreshToken);
        String userId = claims.get("id", String.class);

        // DB에서 유저 정보 조회 (Refresh Token payload에는 id만 있음)
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            log.warn("Refresh attempted for unknown userId: {}", userId);
            return ResponseEntity.status(401).body(Map.of("error", "user_not_found"));
        }

        // 새 액세스 토큰 발급
        String newAccessToken = jwtUtil.generateAccessToken(
                user.getGithubId(),
                user.getLogin(),
                user.getName(),
                user.getAvatarUrl()
        );

        Cookie accessCookie = new Cookie("playground_token", newAccessToken);
        accessCookie.setHttpOnly(false); // 프론트에서 읽을 수 있게
        accessCookie.setMaxAge((int) (jwtUtil.getAccessTokenExpiryMs() / 1000));
        accessCookie.setPath("/");
        response.addCookie(accessCookie);

        log.info("Access token refreshed for userId: {}", userId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    private String extractCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        return Arrays.stream(request.getCookies())
                .filter(c -> name.equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }
}
