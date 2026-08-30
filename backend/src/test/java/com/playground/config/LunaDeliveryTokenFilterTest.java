package com.playground.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class LunaDeliveryTokenFilterTest {
    private static final String VALID_TOKEN = "luna-delivery-test-token-0123456789abcdef";
    private static final String DELIVERY_PATH = "/internal/luna/delivery/projects/sample-app/transition";

    @Test
    void returns_service_unavailable_when_machine_token_is_not_configured() throws Exception {
        LunaDeliveryTokenFilter filter = new LunaDeliveryTokenFilter("short");
        MockHttpServletRequest request = new MockHttpServletRequest("POST", DELIVERY_PATH);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(503);
    }

    @Test
    void rejects_missing_or_wrong_machine_token() throws Exception {
        LunaDeliveryTokenFilter filter = new LunaDeliveryTokenFilter(VALID_TOKEN);

        MockHttpServletResponse missingResponse = new MockHttpServletResponse();
        filter.doFilter(
                new MockHttpServletRequest("POST", DELIVERY_PATH),
                missingResponse,
                new MockFilterChain()
        );
        assertThat(missingResponse.getStatus()).isEqualTo(401);

        MockHttpServletRequest wrongRequest = new MockHttpServletRequest("POST", DELIVERY_PATH);
        wrongRequest.addHeader(LunaDeliveryTokenFilter.HEADER_NAME, VALID_TOKEN + "-wrong");
        MockHttpServletResponse wrongResponse = new MockHttpServletResponse();
        filter.doFilter(wrongRequest, wrongResponse, new MockFilterChain());
        assertThat(wrongResponse.getStatus()).isEqualTo(401);
    }

    @Test
    void allows_matching_token_and_ignores_unrelated_paths() throws Exception {
        LunaDeliveryTokenFilter filter = new LunaDeliveryTokenFilter(VALID_TOKEN);

        MockHttpServletRequest protectedRequest = new MockHttpServletRequest("POST", DELIVERY_PATH);
        protectedRequest.addHeader(LunaDeliveryTokenFilter.HEADER_NAME, VALID_TOKEN);
        MockHttpServletResponse protectedResponse = new MockHttpServletResponse();
        MockFilterChain protectedChain = new MockFilterChain();
        filter.doFilter(protectedRequest, protectedResponse, protectedChain);

        assertThat(protectedResponse.getStatus()).isEqualTo(200);
        assertThat(protectedChain.getRequest()).isSameAs(protectedRequest);

        MockHttpServletRequest publicRequest = new MockHttpServletRequest("GET", "/api/bloom-bouquet/public/projects");
        MockHttpServletResponse publicResponse = new MockHttpServletResponse();
        MockFilterChain publicChain = new MockFilterChain();
        filter.doFilter(publicRequest, publicResponse, publicChain);

        assertThat(publicResponse.getStatus()).isEqualTo(200);
        assertThat(publicChain.getRequest()).isSameAs(publicRequest);
    }
}
