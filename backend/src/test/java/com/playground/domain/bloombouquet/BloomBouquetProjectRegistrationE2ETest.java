package com.playground.domain.bloombouquet;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.bloombouquet.entity.BloomBouquetEvaluationRun;
import com.playground.domain.bloombouquet.repository.BloomBouquetEvaluationRunRepository;
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

import java.time.LocalDateTime;
import java.util.Arrays;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:bloombouquet-e2e;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.show-sql=false",
        "spring.flyway.enabled=false",
        "GITHUB_CLIENT_ID=test-client",
        "GITHUB_CLIENT_SECRET=test-secret",
        "app.jwt.secret=test-jwt-secret-for-bloombouquet-e2e-0123456789abcdef",
        "app.builder.worker-token=test-worker-token-for-bloombouquet-e2e-0123456789abcdef"
})
@AutoConfigureMockMvc
@Transactional
class BloomBouquetProjectRegistrationE2ETest {
    private static final String WORKER_TOKEN = "test-worker-token-for-bloombouquet-e2e-0123456789abcdef";
    private static final String WORKER_A = "bouquet-evaluator-a";
    private static final String WORKER_B = "bouquet-evaluator-b";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private BloomBouquetEvaluationRunRepository runRepository;

    @Test
    void projectIsPublishedOnlyAfterSubmissionAndQueuesBouquetEvaluation() throws Exception {
        Cookie ownerCookie = signUpBouquetAccount("e2e-owner@example.test", "E2E Owner");

        mockMvc.perform(post("/api/bloom-bouquet/teams")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Anonymous Team","slug":"anonymous-team"}
                                """))
                .andExpect(status().isUnauthorized());

        JwtAuthenticationToken legacyUser = new JwtAuthenticationToken(
                "legacy-owner", "legacy-owner", "Legacy Owner", "https://example.test/avatar.png"
        );
        mockMvc.perform(post("/api/bloom-bouquet/teams")
                        .with(authentication(legacyUser))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Legacy Team","slug":"legacy-team"}
                                """))
                .andExpect(status().isForbidden());

        MvcResult teamResult = mockMvc.perform(post("/api/bloom-bouquet/teams")
                        .cookie(ownerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Team Lily","slug":"team-lily"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Team Lily"))
                .andReturn();
        long teamId = json(teamResult).get("id").asLong();

        MvcResult projectResult = mockMvc.perform(post("/api/bloom-bouquet/projects")
                        .cookie(ownerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"teamId":%d,"name":"Bouquet E2E Project","slug":"bouquet-e2e-project","description":"BloomBouquet registration E2E fixture"}
                                """.formatted(teamId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.published").value(false))
                .andReturn();
        long projectId = json(projectResult).get("id").asLong();

        mockMvc.perform(get("/api/bloom-bouquet/projects").cookie(ownerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(projectId))
                .andExpect(jsonPath("$[0].published").value(false));

        Cookie otherOwnerCookie = signUpBouquetAccount("other-owner@example.test", "Other Owner");
        mockMvc.perform(get("/api/bloom-bouquet/projects").cookie(otherOwnerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());

        mockMvc.perform(get("/api/bloom-bouquet/public/projects/{projectId}", projectId))
                .andExpect(status().isNotFound());

        MvcResult submissionResult = mockMvc.perform(post("/api/bloom-bouquet/projects/{projectId}/submissions", projectId)
                        .cookie(ownerCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "version":"1.0.0-e2e",
                                  "demoUrl":"https://example.test/bouquet-e2e",
                                  "frontendRepositoryUrl":"https://github.com/example/bouquet-e2e-frontend",
                                  "backendRepositoryUrl":"https://github.com/example/bouquet-e2e-backend",
                                  "requiresAuth":true,
                                  "authRedirectUri":"https://example.test/auth/bouquet/callback"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.authPolicyId").value("bouquet"))
                .andExpect(jsonPath("$.bouquetClientId").isNotEmpty())
                .andExpect(jsonPath("$.bouquetRedirectUri").value("https://example.test/auth/bouquet/callback"))
                .andExpect(jsonPath("$.evaluationStatus").value("QUEUED"))
                .andReturn();

        JsonNode submission = json(submissionResult);
        long runId = submission.get("evaluationRunId").asLong();

        mockMvc.perform(get("/api/bloom-bouquet/public/projects/{projectId}", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.project.published").value(true))
                .andExpect(jsonPath("$.submissions[0].version").value("1.0.0-e2e"))
                .andExpect(jsonPath("$.submissions[0].evaluationRunId").value(runId))
                .andExpect(jsonPath("$.submissions[0].evaluationStatus").value("QUEUED"));

        mockMvc.perform(post("/internal/builder/worker/bloom-bouquet/runs/claim")
                        .header("X-Builder-Worker-Token", WORKER_TOKEN)
                        .header("X-Bloom-Worker-Id", WORKER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runId").value(runId))
                .andExpect(jsonPath("$.projectId").value(projectId))
                .andExpect(jsonPath("$.projectName").value("Bouquet E2E Project"))
                .andExpect(jsonPath("$.requiresAuth").value(true))
                .andExpect(jsonPath("$.authPolicyId").value("bouquet"))
                .andExpect(jsonPath("$.bouquetClientId").isNotEmpty())
                .andExpect(jsonPath("$.workerId").value(WORKER_A))
                .andExpect(jsonPath("$.leaseExpiresAt").isNotEmpty())
                .andExpect(jsonPath("$.claimCount").value(1));

        mockMvc.perform(post("/internal/builder/worker/bloom-bouquet/runs/{runId}/heartbeat", runId)
                        .header("X-Builder-Worker-Token", WORKER_TOKEN)
                        .header("X-Bloom-Worker-Id", WORKER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runId").value(runId))
                .andExpect(jsonPath("$.workerId").value(WORKER_A))
                .andExpect(jsonPath("$.leaseExpiresAt").isNotEmpty());

        mockMvc.perform(post("/internal/builder/worker/bloom-bouquet/runs/{runId}/heartbeat", runId)
                        .header("X-Builder-Worker-Token", WORKER_TOKEN)
                        .header("X-Bloom-Worker-Id", WORKER_B))
                .andExpect(status().isConflict());

        BloomBouquetEvaluationRun claimedRun = runRepository.findById(runId).orElseThrow();
        claimedRun.setLeaseExpiresAt(LocalDateTime.now().minusSeconds(1));
        runRepository.saveAndFlush(claimedRun);

        mockMvc.perform(post("/internal/builder/worker/bloom-bouquet/runs/claim")
                        .header("X-Builder-Worker-Token", WORKER_TOKEN)
                        .header("X-Bloom-Worker-Id", WORKER_B))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runId").value(runId))
                .andExpect(jsonPath("$.workerId").value(WORKER_B))
                .andExpect(jsonPath("$.claimCount").value(2));

        mockMvc.perform(get("/api/bloom-bouquet/public/evaluations/{runId}", runId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.agentEvaluations").isEmpty());
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

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsByteArray());
    }
}
