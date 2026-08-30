package com.playground.domain.lunadelivery;

import com.playground.domain.lunadelivery.service.LunaDeliveryRegistryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static com.playground.domain.lunadelivery.dto.LunaDeliveryDto.RuntimeUpsertRequest;
import static com.playground.domain.lunadelivery.dto.LunaDeliveryDto.TransitionRequest;
import static com.playground.domain.lunadelivery.dto.LunaDeliveryDto.UpsertProjectRequest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:luna-delivery-service;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.show-sql=false",
        "spring.flyway.enabled=false",
        "GITHUB_CLIENT_ID=test-client",
        "GITHUB_CLIENT_SECRET=test-secret",
        "app.jwt.secret=test-jwt-secret-for-luna-delivery-service-0123456789abcdef",
        "app.builder.worker-token=test-worker-token-for-luna-delivery-service-0123456789abcdef"
})
@Transactional
class LunaDeliveryRegistryServiceTest {
    @Autowired
    LunaDeliveryRegistryService registry;

    @Test
    void allocates_stable_non_overlapping_server_port_pairs_when_omitted() {
        registry.upsertProject(new UpsertProjectRequest(
                "sample-app", "BloomBouquet/sample-app", "abc123",
                "https://bloombouquet.https.gsmsv.site/apps/sample-app/"
        ));
        registry.upsertProject(new UpsertProjectRequest(
                "other-app", "BloomBouquet/other-app", "def456",
                "https://bloombouquet.https.gsmsv.site/apps/other-app/"
        ));

        var first = registry.upsertRuntime(
                "sample-app", "web", new RuntimeUpsertRequest("server", null, null, null, null)
        );
        var repeated = registry.upsertRuntime(
                "sample-app", "web", new RuntimeUpsertRequest("server", null, null, null, null)
        );
        var other = registry.upsertRuntime(
                "other-app", "web", new RuntimeUpsertRequest("server", null, null, null, null)
        );

        assertThat(first.slotAPort()).isBetween(20000, 39999);
        assertThat(first.slotBPort()).isBetween(20000, 39999);
        assertThat(first.slotAPort()).isNotEqualTo(first.slotBPort());
        assertThat(repeated.slotAPort()).isEqualTo(first.slotAPort());
        assertThat(repeated.slotBPort()).isEqualTo(first.slotBPort());
        assertThat(List.of(other.slotAPort(), other.slotBPort()))
                .doesNotContain(first.slotAPort(), first.slotBPort());
    }

    @Test
    void candidate_install_failure_can_be_recorded_from_building() {
        registry.upsertProject(new UpsertProjectRequest(
                "sample-app", "BloomBouquet/sample-app", "abc123",
                "https://bloombouquet.https.gsmsv.site/apps/sample-app/"
        ));
        registry.transition("sample-app", new TransitionRequest("MERGED", null, null));
        registry.transition("sample-app", new TransitionRequest("DELIVERY_PLANNING", null, null));
        registry.transition("sample-app", new TransitionRequest("BUILDING", null, null));

        registry.transition("sample-app", new TransitionRequest(
                "DEPLOY_FAILED", "DEPLOY_FAILED", "candidate install failed"
        ));

        assertThat(registry.get("sample-app").deliveryState()).isEqualTo("DEPLOY_FAILED");
        assertThat(registry.get("sample-app").lastFailureCode()).isEqualTo("DEPLOY_FAILED");
    }

    @Test
    void refuses_completed_before_evaluation_queue() {
        registry.upsertProject(new UpsertProjectRequest(
                "sample-app",
                "BloomBouquet/sample-app",
                "abc123",
                "https://bloombouquet.https.gsmsv.site/apps/sample-app/"
        ));

        assertThatThrownBy(() -> registry.transition(
                "sample-app",
                new TransitionRequest("COMPLETED", null, null)
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("CODE_COMPLETE")
                .hasMessageContaining("COMPLETED");
    }

    @Test
    void allows_full_happy_path_to_completed() {
        registry.upsertProject(new UpsertProjectRequest(
                "sample-app",
                "BloomBouquet/sample-app",
                "abc123",
                "https://bloombouquet.https.gsmsv.site/apps/sample-app/"
        ));

        for (String state : List.of(
                "MERGED",
                "DELIVERY_PLANNING",
                "BUILDING",
                "CANDIDATE_READY",
                "LOCAL_VERIFYING",
                "GATEWAY_SWITCHING",
                "PUBLIC_VERIFYING",
                "DEPLOYED",
                "REGISTERING",
                "BLOOMBOUQUET_REGISTERED",
                "EVALUATION_QUEUED",
                "COMPLETED"
        )) {
            registry.transition("sample-app", new TransitionRequest(state, null, null));
        }

        assertThat(registry.get("sample-app").deliveryState()).isEqualTo("COMPLETED");
    }

    @Test
    void retry_state_can_only_resume_at_its_legal_stage() {
        registry.upsertProject(new UpsertProjectRequest(
                "sample-app",
                "BloomBouquet/sample-app",
                "abc123",
                "https://bloombouquet.https.gsmsv.site/apps/sample-app/"
        ));
        registry.transition("sample-app", new TransitionRequest("MERGED", null, null));
        registry.transition("sample-app", new TransitionRequest("DELIVERY_PLANNING", null, null));
        registry.transition("sample-app", new TransitionRequest("BUILDING", null, null));
        registry.transition("sample-app", new TransitionRequest("BUILD_FAILED", "BUILD_FAILED", "build command failed"));

        assertThatThrownBy(() -> registry.transition(
                "sample-app",
                new TransitionRequest("CANDIDATE_READY", null, null)
        )).isInstanceOf(IllegalStateException.class);

        registry.transition("sample-app", new TransitionRequest("DELIVERY_PLANNING", null, null));
        assertThat(registry.get("sample-app").deliveryState()).isEqualTo("DELIVERY_PLANNING");
    }
}
