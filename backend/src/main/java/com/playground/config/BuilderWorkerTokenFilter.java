package com.playground.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class BuilderWorkerTokenFilter extends OncePerRequestFilter {
    static final String HEADER_NAME = "X-Builder-Worker-Token";
    private static final String PATH_PREFIX = "/internal/builder/worker/";

    private final String configuredToken;

    public BuilderWorkerTokenFilter(@Value("${app.builder.worker-token:}") String configuredToken) {
        this.configuredToken = configuredToken == null ? "" : configuredToken.trim();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (configuredToken.length() < 32) {
            response.sendError(HttpServletResponse.SC_SERVICE_UNAVAILABLE, "Builder worker token is not configured.");
            return;
        }

        String presented = request.getHeader(HEADER_NAME);
        if (!constantTimeEquals(configuredToken, presented)) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid builder worker token.");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean constantTimeEquals(String expected, String actual) {
        if (actual == null) {
            return false;
        }
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8)
        );
    }
}
