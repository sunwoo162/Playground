package com.playground.config;

import com.playground.domain.user.entity.User;
import com.playground.domain.user.repository.UserRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Arrays;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String token = extractToken(request);
        log.debug("JWT Filter - URI: {}, token present: {}", request.getRequestURI(), token != null);

        if (token != null) {
            if (jwtUtil.isValid(token) && !"refresh".equals(jwtUtil.getTokenType(token))) {
                Claims claims = jwtUtil.parseToken(token);
                String userId = claims.get("id", String.class);

                upsertUser(userId, claims);

                JwtAuthenticationToken auth = new JwtAuthenticationToken(
                        userId,
                        claims.get("login", String.class),
                        claims.get("name", String.class),
                        claims.get("avatar_url", String.class)
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            } else {
                log.warn("JWT invalid token received");
                SecurityContextHolder.clearContext();
            }
        }

        filterChain.doFilter(request, response);
    }

    private void upsertUser(String userId, Claims claims) {
        try {
            userRepository.findById(userId).ifPresentOrElse(
                user -> {
                    user.setLastLoginAt(LocalDateTime.now());
                    userRepository.save(user);
                },
                () -> userRepository.save(User.builder()
                    .githubId(userId)
                    .login(claims.get("login", String.class))
                    .name(claims.get("name", String.class))
                    .avatarUrl(claims.get("avatar_url", String.class))
                    .lastLoginAt(LocalDateTime.now())
                    .build())
            );
        } catch (Exception e) {
            // DB 에러가 인증을 막으면 안 됨
        }
    }

    private String extractToken(HttpServletRequest request) {
        if (request.getCookies() != null) {
            return Arrays.stream(request.getCookies())
                    .filter(c -> "playground_token".equals(c.getName()))
                    .map(Cookie::getValue)
                    .findFirst()
                    .orElse(null);
        }
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
