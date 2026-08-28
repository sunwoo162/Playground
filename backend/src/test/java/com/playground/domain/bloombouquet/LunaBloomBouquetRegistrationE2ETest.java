package com.playground.domain.bloombouquet;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.bouquetauth.controller.BouquetAuthController;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:luna-bouquet-e2e;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.show-sql=false",
        "spring.flyway.enabled=false",
        "GITHUB_CLIENT_ID=test-client",
        "GITHUB_CLIENT_SECRET=test-secret",
        "app.jwt.secret=test-jwt-secret-for-luna-bouquet-e2e-0123456789abcdef",
        "app.builder.worker-token=test-worker-token-for-luna-bouquet-e2e-0123456789abcdef"
})
@AutoConfigureMockMvc
@Transactional
class LunaBloomBouquetRegistrationE2ETest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void oneClickRegistrationCreatesLilyProjectAndIsIdempotent() throws Exception {
        Cookie ownerCookie = signUpBouquetAccount("luna-owner@example.test", "Luna Owner");
        String payload = payload("https://example.test/apps/evidence-vault/");

        MvcResult first = mockMvc.perform(post("/api/bloom-bouquet/luna/register")
                        .cookie(ownerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.team.name").value("백합"))
                .andExpect(jsonPath("$.team.slug").value("lily"))
                .andExpect(jsonPath("$.project.slug").value("evidence-vault"))
                .andExpect(jsonPath("$.project.published").value(true))
                .andExpect(jsonPath("$.submission.evaluationStatus").value("QUEUED"))
                .andExpect(jsonPath("$.submission.bouquetClientId").isNotEmpty())
                .andExpect(jsonPath("$.submission.bouquetRedirectUri")
                        .value("https://example.test/apps/evidence-vault/auth/bouquet/callback"))
                .andReturn();

        JsonNode firstJson = objectMapper.readTree(first.getResponse().getContentAsByteArray());
        long firstSubmissionId = firstJson.at("/submission/id").asLong();
        long firstRunId = firstJson.at("/submission/evaluationRunId").asLong();

        mockMvc.perform(post("/api/bloom-bouquet/luna/register")
                        .cookie(ownerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.submission.id").value(firstSubmissionId))
                .andExpect(jsonPath("$.submission.evaluationRunId").value(firstRunId));

        mockMvc.perform(post("/api/bloom-bouquet/luna/register")
                        .cookie(ownerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload("https://example.test/apps/evidence-vault-v2/")))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/bloom-bouquet/luna/register")
                        .cookie(ownerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload.replace("\"projectName\":\"증빙함\"", "\"projectName\":\"다른 프로젝트\"")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void oneClickRegistrationRequiresBouquetSession() throws Exception {
        mockMvc.perform(post("/api/bloom-bouquet/luna/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload("https://example.test/apps/evidence-vault/")))
                .andExpect(status().isUnauthorized());

        JwtAuthenticationToken legacyUser = new JwtAuthenticationToken(
                "legacy-owner", "legacy-owner", "Legacy Owner", "https://example.test/avatar.png"
        );
        mockMvc.perform(post("/api/bloom-bouquet/luna/register")
                        .with(authentication(legacyUser))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload("https://example.test/apps/evidence-vault/")))
                .andExpect(status().isForbidden());
    }

    private String payload(String demoUrl) {
        String callback = demoUrl.replaceAll("/+$", "") + "/auth/bouquet/callback";
        return """
                {
                  "schemaVersion":1,
                  "teamId":"lily",
                  "teamName":"백합",
                  "projectName":"증빙함",
                  "projectSlug":"evidence-vault",
                  "description":"증빙 자료를 안전하게 저장하고 관리하는 서비스",
                  "version":"1.0.0",
                  "demoUrl":"%s",
                  "repositoryUrl":"https://github.com/BloomBouquet/evidence-vault",
                  "requiresAuth":true,
                  "authRedirectUri":"%s"
                }
                """.formatted(demoUrl, callback);
    }

    private Cookie signUpBouquetAccount(String email, String displayName) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/bouquet/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"password-1234","displayName":"%s"}
                                """.formatted(email, displayName)))
                .andExpect(status().isCreated())
                .andReturn();

        return Arrays.stream(result.getResponse().getCookies())
                .filter(cookie -> BouquetAuthController.SESSION_COOKIE.equals(cookie.getName()))
                .findFirst()
                .orElseThrow();
    }
}
