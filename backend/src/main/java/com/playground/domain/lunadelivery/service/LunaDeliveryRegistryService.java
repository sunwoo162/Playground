package com.playground.domain.lunadelivery.service;

import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.ProjectDetailResponse;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.ProjectStateResponse;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.RuntimeResponse;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.RuntimeUpsertRequest;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.TransitionRequest;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.UpsertProjectRequest;
import com.playground.domain.lunadelivery.entity.LunaDeliveryProject;
import com.playground.domain.lunadelivery.entity.LunaDeliveryRuntime;
import com.playground.domain.lunadelivery.repository.LunaDeliveryProjectRepository;
import com.playground.domain.lunadelivery.repository.LunaDeliveryRuntimeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class LunaDeliveryRegistryService {
    private static final Pattern SLUG_PATTERN = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");
    private static final Pattern RUNTIME_ID_PATTERN = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");
    private static final Set<String> RUNTIME_TYPES = Set.of("static", "server");
    private static final int AUTO_PORT_MIN = 20000;
    private static final int AUTO_PORT_MAX = 39999;
    private static final List<String> HAPPY_PATH = List.of(
            "CODE_COMPLETE", "MERGED", "DELIVERY_PLANNING", "BUILDING",
            "CANDIDATE_READY", "LOCAL_VERIFYING", "GATEWAY_SWITCHING",
            "PUBLIC_VERIFYING", "DEPLOYED", "REGISTERING",
            "BLOOMBOUQUET_REGISTERED", "EVALUATION_QUEUED", "COMPLETED"
    );
    private static final Map<String, Set<String>> FAILURE_ORIGINS = Map.of(
            "BLOCKED_MISSING_SECRET", Set.of("DELIVERY_PLANNING", "BUILDING"),
            "BUILD_FAILED", Set.of("BUILDING"),
            "DEPLOY_FAILED", Set.of("CANDIDATE_READY", "LOCAL_VERIFYING", "GATEWAY_SWITCHING"),
            "HEALTH_FAILED", Set.of("LOCAL_VERIFYING", "PUBLIC_VERIFYING"),
            "REGISTRATION_PENDING", Set.of("REGISTERING"),
            "EVALUATION_PENDING", Set.of("BLOOMBOUQUET_REGISTERED")
    );
    private static final Map<String, String> RETRY_TARGETS = Map.of(
            "BLOCKED_MISSING_SECRET", "DELIVERY_PLANNING",
            "BUILD_FAILED", "DELIVERY_PLANNING",
            "DEPLOY_FAILED", "BUILDING",
            "HEALTH_FAILED", "DELIVERY_PLANNING",
            "REGISTRATION_PENDING", "DEPLOYED",
            "EVALUATION_PENDING", "BLOOMBOUQUET_REGISTERED"
    );

    private final LunaDeliveryProjectRepository projectRepository;
    private final LunaDeliveryRuntimeRepository runtimeRepository;

    @Transactional
    public ProjectStateResponse upsertProject(UpsertProjectRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Luna delivery project request is required.");
        }
        String slug = normalizeSlug(request.slug());
        String repository = required(request.repositoryFullName(), "repositoryFullName", 200);
        String mainSha = required(request.mainSha(), "mainSha", 64);
        String publicUrl = normalizePublicUrl(request.publicUrl(), slug);

        LunaDeliveryProject project = projectRepository.findBySlugForUpdate(slug)
                .orElseGet(() -> LunaDeliveryProject.builder()
                        .slug(slug)
                        .repositoryFullName(repository)
                        .mainSha(mainSha)
                        .adoptionState("DISCOVERED")
                        .deliveryState("CODE_COMPLETE")
                        .publicUrl(publicUrl)
                        .retryCount(0)
                        .build());

        project.setRepositoryFullName(repository);
        project.setMainSha(mainSha);
        project.setPublicUrl(publicUrl);
        if (project.getAdoptionState() == null || project.getAdoptionState().isBlank()) {
            project.setAdoptionState("DISCOVERED");
        }
        if (project.getDeliveryState() == null || project.getDeliveryState().isBlank()) {
            project.setDeliveryState("CODE_COMPLETE");
        }
        return toResponse(projectRepository.save(project));
    }

    @Transactional(readOnly = true)
    public ProjectStateResponse get(String slug) {
        return toResponse(requireProject(slug));
    }

    @Transactional(readOnly = true)
    public ProjectDetailResponse getDetail(String slug) {
        LunaDeliveryProject project = requireProject(slug);
        List<RuntimeResponse> runtimes = runtimeRepository.findByProjectIdOrderByRuntimeIdAsc(project.getId())
                .stream()
                .map(this::toRuntimeResponse)
                .toList();
        return new ProjectDetailResponse(toResponse(project), runtimes);
    }

    @Transactional
    public RuntimeResponse upsertRuntime(String slug, String runtimeId, RuntimeUpsertRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Luna delivery runtime request is required.");
        }
        LunaDeliveryProject project = projectRepository.findBySlugForUpdate(normalizeSlug(slug))
                .orElseThrow(() -> new NoSuchElementException("Luna delivery project not found."));
        String normalizedRuntimeId = normalizeRuntimeId(runtimeId);
        String runtimeType = required(request.runtimeType(), "runtimeType", 20).toLowerCase();
        if (!RUNTIME_TYPES.contains(runtimeType)) {
            throw new IllegalArgumentException("runtimeType must be static or server.");
        }

        String activeSlot = normalizeSlot(request.activeSlot(), "activeSlot");
        String candidateSlot = normalizeSlot(request.candidateSlot(), "candidateSlot");
        if (activeSlot != null && activeSlot.equals(candidateSlot)) {
            throw new IllegalArgumentException("activeSlot and candidateSlot must be different.");
        }

        LunaDeliveryRuntime runtime = runtimeRepository
                .findByProjectIdAndRuntimeId(project.getId(), normalizedRuntimeId)
                .orElseGet(() -> LunaDeliveryRuntime.builder()
                        .project(project)
                        .runtimeId(normalizedRuntimeId)
                        .build());
        runtime.setRuntimeType(runtimeType);

        if ("static".equals(runtimeType)) {
            normalizePort(request.slotAPort(), runtimeType, "slotAPort");
            normalizePort(request.slotBPort(), runtimeType, "slotBPort");
            runtime.setSlotAPort(null);
            runtime.setSlotBPort(null);
        } else {
            assignServerPorts(runtime, request.slotAPort(), request.slotBPort());
        }

        runtime.setActiveSlot(activeSlot);
        runtime.setCandidateSlot(candidateSlot);
        return toRuntimeResponse(runtimeRepository.save(runtime));
    }

    private void assignServerPorts(LunaDeliveryRuntime runtime, Integer requestedA, Integer requestedB) {
        if ((requestedA == null) != (requestedB == null)) {
            throw new IllegalArgumentException("Server runtimes must provide both A/B ports or omit both for automatic allocation.");
        }
        if (requestedA != null) {
            int slotAPort = normalizePort(requestedA, "server", "slotAPort");
            int slotBPort = normalizePort(requestedB, "server", "slotBPort");
            if (slotAPort == slotBPort) {
                throw new IllegalArgumentException("A/B runtime ports must be different.");
            }
            runtime.setSlotAPort(slotAPort);
            runtime.setSlotBPort(slotBPort);
            return;
        }
        if (runtime.getSlotAPort() != null && runtime.getSlotBPort() != null) {
            return;
        }

        LunaDeliveryRuntime persisted = runtimeRepository.save(runtime);
        long offset = (persisted.getId() - 1L) * 2L;
        long slotA = AUTO_PORT_MIN + offset;
        long slotB = slotA + 1L;
        if (slotA < AUTO_PORT_MIN || slotB > AUTO_PORT_MAX) {
            throw new IllegalStateException("Luna automatic server port range is exhausted.");
        }
        runtime.setSlotAPort((int) slotA);
        runtime.setSlotBPort((int) slotB);
    }

    @Transactional
    public ProjectStateResponse transition(String slug, TransitionRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Luna delivery transition request is required.");
        }
        String normalizedSlug = normalizeSlug(slug);
        String target = required(request.state(), "state", 40).toUpperCase();
        if (!HAPPY_PATH.contains(target) && !FAILURE_ORIGINS.containsKey(target)) {
            throw new IllegalArgumentException("Unsupported Luna delivery state: " + target);
        }

        LunaDeliveryProject project = projectRepository.findBySlugForUpdate(normalizedSlug)
                .orElseThrow(() -> new NoSuchElementException("Luna delivery project not found."));
        String current = required(project.getDeliveryState(), "current delivery state", 40).toUpperCase();
        if (!current.equals(target)) {
            assertLegalTransition(current, target);
            project.setDeliveryState(target);
        }

        LocalDateTime now = LocalDateTime.now();
        project.setLastAttemptAt(now);
        if (request.localHealth() != null && !request.localHealth().isBlank()) {
            project.setLastLocalHealth(bounded(request.localHealth(), "localHealth", 4000));
        }
        if (request.publicHealth() != null && !request.publicHealth().isBlank()) {
            project.setLastPublicHealth(bounded(request.publicHealth(), "publicHealth", 4000));
        }

        if (FAILURE_ORIGINS.containsKey(target)) {
            project.setLastFailureCode(required(request.failureCode(), "failureCode", 80));
            project.setLastFailureReason(required(request.failureReason(), "failureReason", 2000));
            project.setRetryCount(Math.max(0, project.getRetryCount()) + 1);
            project.setNextRetryAt(request.nextRetryAt());
        } else {
            project.setLastFailureCode(null);
            project.setLastFailureReason(null);
            project.setNextRetryAt(null);
        }

        return toResponse(projectRepository.save(project));
    }

    private void assertLegalTransition(String current, String target) {
        Set<String> failureOrigins = FAILURE_ORIGINS.get(target);
        if (failureOrigins != null) {
            if (!failureOrigins.contains(current)) throw illegalTransition(current, target);
            return;
        }
        String retryTarget = RETRY_TARGETS.get(current);
        if (retryTarget != null) {
            if (!retryTarget.equals(target)) throw illegalTransition(current, target);
            return;
        }
        int currentIndex = HAPPY_PATH.indexOf(current);
        int targetIndex = HAPPY_PATH.indexOf(target);
        if (currentIndex < 0 || targetIndex != currentIndex + 1) {
            throw illegalTransition(current, target);
        }
    }

    private IllegalStateException illegalTransition(String current, String target) {
        return new IllegalStateException("Illegal Luna delivery state transition: " + current + " -> " + target);
    }

    private LunaDeliveryProject requireProject(String slug) {
        return projectRepository.findBySlug(normalizeSlug(slug))
                .orElseThrow(() -> new NoSuchElementException("Luna delivery project not found."));
    }

    private String normalizeSlug(String value) {
        String slug = required(value, "slug", 160).toLowerCase();
        if (!SLUG_PATTERN.matcher(slug).matches()) {
            throw new IllegalArgumentException("Luna delivery slug format is invalid.");
        }
        return slug;
    }

    private String normalizeRuntimeId(String value) {
        String runtimeId = required(value, "runtimeId", 80).toLowerCase();
        if (!RUNTIME_ID_PATTERN.matcher(runtimeId).matches()) {
            throw new IllegalArgumentException("Luna delivery runtimeId format is invalid.");
        }
        return runtimeId;
    }

    private Integer normalizePort(Integer port, String runtimeType, String label) {
        if ("static".equals(runtimeType)) {
            if (port != null) throw new IllegalArgumentException("Static runtimes cannot reserve server ports.");
            return null;
        }
        if (port == null || port < 1024 || port > 65535) {
            throw new IllegalArgumentException(label + " must be between 1024 and 65535 for server runtimes.");
        }
        return port;
    }

    private String normalizeSlot(String value, String label) {
        if (value == null || value.isBlank()) return null;
        String slot = value.trim().toUpperCase();
        if (!Set.of("A", "B").contains(slot)) {
            throw new IllegalArgumentException(label + " must be A or B.");
        }
        return slot;
    }

    private String normalizePublicUrl(String value, String slug) {
        String canonical = "https://bloombouquet.https.gsmsv.site/apps/" + slug + "/";
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) return canonical;
        if (normalized.length() > 500) throw new IllegalArgumentException("publicUrl exceeds the allowed length.");
        URI uri;
        try {
            uri = URI.create(normalized);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("publicUrl is invalid.");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
            throw new IllegalArgumentException("publicUrl must use HTTPS.");
        }
        if (!normalized.equals(canonical)) {
            throw new IllegalArgumentException("publicUrl must match the canonical Luna app URL.");
        }
        return normalized;
    }

    private String required(String value, String label, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) throw new IllegalArgumentException(label + " is required.");
        if (normalized.length() > maxLength) throw new IllegalArgumentException(label + " exceeds the allowed length.");
        return normalized;
    }

    private String bounded(String value, String label, int maxLength) {
        String normalized = value.trim();
        if (normalized.length() > maxLength) throw new IllegalArgumentException(label + " exceeds the allowed length.");
        return normalized;
    }

    private ProjectStateResponse toResponse(LunaDeliveryProject project) {
        return new ProjectStateResponse(
                project.getId(), project.getSlug(), project.getRepositoryFullName(), project.getMainSha(),
                project.getManifestDigest(), project.getAdoptionState(), project.getDeliveryState(), project.getPublicUrl(),
                project.getActiveReleaseSha(), project.getPreviousHealthyReleaseSha(), project.getLastLocalHealth(),
                project.getLastPublicHealth(), project.getBloomTeamId(), project.getBloomProjectId(),
                project.getBloomSubmissionId(), project.getBloomEvaluationRunId(), project.getLastFailureCode(),
                project.getLastFailureReason(), project.getRetryCount(), project.getLastAttemptAt(), project.getNextRetryAt()
        );
    }

    private RuntimeResponse toRuntimeResponse(LunaDeliveryRuntime runtime) {
        return new RuntimeResponse(
                runtime.getId(), runtime.getRuntimeId(), runtime.getRuntimeType(), runtime.getSlotAPort(),
                runtime.getSlotBPort(), runtime.getActiveSlot(), runtime.getCandidateSlot()
        );
    }
}
