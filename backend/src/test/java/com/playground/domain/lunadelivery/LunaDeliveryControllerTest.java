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
        "spring.datasource.url=jdbc:h2:mem:luna-delivery-controller;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.show-sql=false",
        "spring.flyway.enabled=false",
        "GITHUB_CLIENT_ID=test-client",
        "GITHUB_CLIENT_SECRET=test-secret",
        "app.jwt.secret=test-jwt-secret-for-luna-delivery-controller-0123456789abcdef",
        "app.builder.worker-token=test-worker-token-for-luna-delivery-controller-0123456789abcdef",
        "app.luna.delivery-token=luna-delivery-controller-token-0123456789abcdef"
})
@AutoConfigureMockMvc
@Transactional
class LunaDeliveryControllerTest {
    private static final String TOKEN = "luna-delivery-controller-token-0123456789abcdef";

    @Autowired
    MockMvc mockMvc;

    @Test
    void upsert_get_transition_and_runtime_round_trip() throws Exception {
        mockMvc.perform(put("/internal/luna/delivery/projects/sample-app")
                        .header(LunaDeliveryTokenFilter.HEADER_NAME, TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "slug":"sample-app",
                                  "repositoryFullName":"BloomBouquet/sample-app",
                                  "mainSha":"abc123",
                                  "publicUrl":"https://bloombouquet.https.gsmsv.site/apps/sample-app/"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value("sample-app"))
                .andExpect(jsonPath("$.deliveryState").value("CODE_COMPLETE"))
                .andExpect(jsonPath("$.retryCount").value(0));

        mockMvc.perform(put("/internal/luna/delivery/projects/sample-app/runtimes/web")
                        .header(LunaDeliveryTokenFilter.HEADER_NAME, TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "runtimeType":"server",
                                  "slotAPort":3200,
                                  "slotBPort":3201,
                                  "activeSlot":"A",
                                  "candidateSlot":"B"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runtimeId").value("web"))
                .andExpect(jsonPath("$.slotAPort").value(3200));

        mockMvc.perform(post("/internal/luna/delivery/projects/sample-app/transition")
                        .header(LunaDeliveryTokenFilter.HEADER_NAME, TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "state":"MERGED",
                                  "localHealth":"not-run",
                                  "publicHealth":"not-run"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deliveryState").value("MERGED"));

        mockMvc.perform(get("/internal/luna/delivery/projects/sample-app")
                        .header(LunaDeliveryTokenFilter.HEADER_NAME, TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.project.repositoryFullName").value("BloomBouquet/sample-app"))
                .andExpect(jsonPath("$.project.mainSha").value("abc123"))
                .andExpect(jsonPath("$.project.deliveryState").value("MERGED"))
                .andExpect(jsonPath("$.project.retryCount").value(0))
                .andExpect(jsonPath("$.project.nextRetryAt").doesNotExist())
                .andExpect(jsonPath("$.runtimes[0].runtimeId").value("web"))
                .andExpect(jsonPath("$.runtimes[0].activeSlot").value("A"));
    }

    @Test
    void rejects_registry_access_without_delivery_token() throws Exception {
        mockMvc.perform(get("/internal/luna/delivery/projects/sample-app"))
                .andExpect(status().isUnauthorized());
    }
}
