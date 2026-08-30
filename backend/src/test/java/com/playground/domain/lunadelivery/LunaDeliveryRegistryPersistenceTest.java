package com.playground.domain.lunadelivery;

import com.playground.domain.lunadelivery.entity.LunaDeliveryProject;
import com.playground.domain.lunadelivery.entity.LunaDeliveryRuntime;
import com.playground.domain.lunadelivery.repository.LunaDeliveryProjectRepository;
import com.playground.domain.lunadelivery.repository.LunaDeliveryRuntimeRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:luna-delivery-registry;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.show-sql=false",
        "spring.flyway.enabled=false",
        "GITHUB_CLIENT_ID=test-client",
        "GITHUB_CLIENT_SECRET=test-secret",
        "app.jwt.secret=test-jwt-secret-for-luna-delivery-registry-0123456789abcdef",
        "app.builder.worker-token=test-worker-token-for-luna-delivery-registry-0123456789abcdef"
})
@Transactional
class LunaDeliveryRegistryPersistenceTest {
    @Autowired
    LunaDeliveryProjectRepository projects;

    @Autowired
    LunaDeliveryRuntimeRepository runtimes;

    @Test
    void persists_project_and_ab_runtime_state() {
        LunaDeliveryProject project = projects.save(LunaDeliveryProject.builder()
                .slug("sample-app")
                .repositoryFullName("BloomBouquet/sample-app")
                .mainSha("abc123")
                .manifestDigest("manifest-sha256")
                .adoptionState("DISCOVERED")
                .deliveryState("CODE_COMPLETE")
                .publicUrl("https://bloombouquet.https.gsmsv.site/apps/sample-app/")
                .retryCount(0)
                .build());

        runtimes.save(LunaDeliveryRuntime.builder()
                .project(project)
                .runtimeId("web")
                .runtimeType("server")
                .slotAPort(3200)
                .slotBPort(3201)
                .activeSlot("A")
                .candidateSlot("B")
                .build());

        LunaDeliveryProject persisted = projects.findBySlugForUpdate("sample-app").orElseThrow();
        assertThat(persisted.getRepositoryFullName()).isEqualTo("BloomBouquet/sample-app");
        assertThat(persisted.getDeliveryState()).isEqualTo("CODE_COMPLETE");

        assertThat(runtimes.findByProjectIdOrderByRuntimeIdAsc(project.getId()))
                .singleElement()
                .satisfies(runtime -> {
                    assertThat(runtime.getRuntimeId()).isEqualTo("web");
                    assertThat(runtime.getSlotAPort()).isEqualTo(3200);
                    assertThat(runtime.getSlotBPort()).isEqualTo(3201);
                    assertThat(runtime.getActiveSlot()).isEqualTo("A");
                    assertThat(runtime.getCandidateSlot()).isEqualTo("B");
                });
    }
}
