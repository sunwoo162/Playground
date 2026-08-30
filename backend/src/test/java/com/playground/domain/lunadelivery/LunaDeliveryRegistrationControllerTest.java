package com.playground.domain.lunadelivery;

import com.playground.config.LunaDeliveryTokenFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:luna-delivery-registration;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.show-sql=false",
        "spring.flyway.enabled=false",
        "GITHUB_CLIENT_ID=test-client",
        "GITHUB_CLIENT_SECRET=test-secret",
        "app.jwt.secret=test-jwt-secret-for-luna-registration-0123456789abcdef",
        "app.builder.worker-token=test-worker-token-for-luna-registration-0123456789abcdef",
        "app.luna.delivery-token=luna-delivery-registration-token-0123456789abcdef",
        "app.luna.system-owner-id=luna-system-owner-test"
})
@AutoConfigureMockMvc
@Transactional
class LunaDeliveryRegistrationControllerTest {
    private static final String TOKEN = "luna-delivery-registration-token-0123456789abcdef";

    @Autowired
    MockMvc mockMvc;

    @Test
    void machine_registration_returns_queued_evaluation_and_records_registry_ids() throws Exception {
        mockMvc.perform(put("/internal/luna/delivery/projects/sample-app")
                        .header(LunaDeliveryTokenFilter.HEADER_NAME, TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "slug":"sample-app",
                                  "repositoryFullName":"BloomBouquet/sample-app",
                                  "mainSha":"0123456789abcdef0123456789abcdef01234567",
                                  "publicUrl":"https://bloombouquet.https.gsmsv.site/apps/sample-app/"
                                }
                                """))
                .andExpect(status().isOk());

        String registration = """
                {
                  "schemaVersion":1,
                  "teamId":"lily",
                  "teamName":"백합",
                  "projectName":"Sample App",
                  "projectSlug":"sample-app",
                  "description":"Luna automatic delivery test project",
                  "version":"1.2.3+0123456789ab",
                  "demoUrl":"https://bloombouquet.https.gsmsv.site/apps/sample-app/",
                  "repositoryUrl":"https://github.com/BloomBouquet/sample-app",
                  "requiresAuth":false,
                  "authRedirectUri":null
                }
                """;

        mockMvc.perform(post("/internal/luna/delivery/register")
                        .header(LunaDeliveryTokenFilter.HEADER_NAME, TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registration))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.teamId").isNumber())
                .andExpect(jsonPath("$.projectId").isNumber())
                .andExpect(jsonPath("$.submissionId").isNumber())
                .andExpect(jsonPath("$.evaluationRunId").isNumber())
                .andExpect(jsonPath("$.evaluationStatus").value("QUEUED"));

        mockMvc.perform(post("/internal/luna/delivery/register")
                        .header(LunaDeliveryTokenFilter.HEADER_NAME, TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registration))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.evaluationStatus").value("QUEUED"));

        mockMvc.perform(get("/internal/luna/delivery/projects/sample-app")
                        .header(LunaDeliveryTokenFilter.HEADER_NAME, TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.project.bloomTeamId").isNumber())
                .andExpect(jsonPath("$.project.bloomProjectId").isNumber())
                .andExpect(jsonPath("$.project.bloomSubmissionId").isNumber())
                .andExpect(jsonPath("$.project.bloomEvaluationRunId").isNumber());
    }

    @Test
    void machine_registration_requires_delivery_token() throws Exception {
        mockMvc.perform(post("/internal/luna/delivery/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }
}
