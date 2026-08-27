package com.playground.domain.bloombouquet;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.playground.config.JwtAuthenticationToken;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

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

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void projectIsPublishedOnlyAfterSubmissionAndQueuesBouquetEvaluation() throws Exception {
        JwtAuthenticationToken user = new JwtAuthenticationToken(
                "e2e-owner", "e2e-owner", "E2E Owner", "https://example.test/avatar.png"
        );

        MvcResult teamResult = mockMvc.perform(post("/api/bloom-bouquet/teams")
                        .with(authentication(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Team Lily","slug":"team-lily"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Team Lily"))
                .andReturn();
        long teamId = json(teamResult).get("id").asLong();

        MvcResult projectResult = mockMvc.perform(post("/api/bloom-bouquet/projects")
                        .with(authentication(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"teamId":%d,"name":"Bouquet E2E Project","slug":"bouquet-e2e-project","description":"BloomBouquet registration E2E fixture"}
                                """.formatted(teamId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.published").value(false))
                .andReturn();
        long projectId = json(projectResult).get("id").asLong();

        mockMvc.perform(get("/api/bloom-bouquet/public/projects/{projectId}", projectId))
                .andExpect(status().isNotFound());

        MvcResult submissionResult = mockMvc.perform(post("/api/bloom-bouquet/projects/{projectId}/submissions", projectId)
                        .with(authentication(user))
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
                        .header("X-Builder-Worker-Token", WORKER_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runId").value(runId))
                .andExpect(jsonPath("$.projectId").value(projectId))
                .andExpect(jsonPath("$.projectName").value("Bouquet E2E Project"))
                .andExpect(jsonPath("$.requiresAuth").value(true))
                .andExpect(jsonPath("$.authPolicyId").value("bouquet"))
                .andExpect(jsonPath("$.bouquetClientId").isNotEmpty());

        mockMvc.perform(get("/api/bloom-bouquet/public/evaluations/{runId}", runId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.agentEvaluations").isEmpty());
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsByteArray());
    }
}
