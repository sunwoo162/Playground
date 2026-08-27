package com.playground.config;

import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BuilderWorkerTokenFilterTest {
    private static final String VALID_TOKEN = "0123456789abcdef0123456789abcdef";

    @Test
    void nonWorkerPathBypassesWorkerTokenCheck() throws ServletException, IOException {
        BuilderWorkerTokenFilter filter = new BuilderWorkerTokenFilter("");
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/builder/projects");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
    }

    @Test
    void workerPathFailsClosedWhenServerTokenIsNotConfigured() throws ServletException, IOException {
        BuilderWorkerTokenFilter filter = new BuilderWorkerTokenFilter("too-short");
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/internal/builder/worker/runs/claim");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(503, response.getStatus());
    }

    @Test
    void workerPathRejectsInvalidToken() throws ServletException, IOException {
        BuilderWorkerTokenFilter filter = new BuilderWorkerTokenFilter(VALID_TOKEN);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/internal/builder/worker/runs/claim");
        request.addHeader(BuilderWorkerTokenFilter.HEADER_NAME, "invalid-invalid-invalid-invalid-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(401, response.getStatus());
    }

    @Test
    void workerPathAllowsExactToken() throws ServletException, IOException {
        BuilderWorkerTokenFilter filter = new BuilderWorkerTokenFilter(VALID_TOKEN);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/internal/builder/worker/runs/claim");
        request.addHeader(BuilderWorkerTokenFilter.HEADER_NAME, VALID_TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(200, response.getStatus());
    }
}
