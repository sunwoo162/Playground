package com.playground.config;

import com.playground.domain.bouquetauth.controller.BouquetAuthController;
import com.playground.domain.bouquetauth.service.BouquetAuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;

@Component
@RequiredArgsConstructor
public class BouquetSessionAuthFilter extends OncePerRequestFilter {
    private static final String BLOOM_BOUQUET_PATH_PREFIX = "/api/bloom-bouquet/";

    private final BouquetAuthService bouquetAuthService;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(BLOOM_BOUQUET_PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        Authentication existing = SecurityContextHolder.getContext().getAuthentication();
        if (existing != null && existing.isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }

        String sessionToken = extractCookie(request, BouquetAuthController.SESSION_COOKIE);
        bouquetAuthService.resolveSession(sessionToken).ifPresent(account ->
                SecurityContextHolder.getContext().setAuthentication(
                        new BouquetAuthenticationToken(account.id(), account.email(), account.displayName())
                )
        );

        filterChain.doFilter(request, response);
    }

    private String extractCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) {
            return null;
        }
        return Arrays.stream(request.getCookies())
                .filter(cookie -> name.equals(cookie.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }
}
