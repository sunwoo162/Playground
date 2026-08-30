package com.playground.domain.lunadelivery.service;

import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.ProjectStateResponse;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.TransitionRequest;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.UpsertProjectRequest;
import com.playground.domain.lunadelivery.entity.LunaDeliveryProject;
import com.playground.domain.lunadelivery.repository.LunaDeliveryProjectRepository;
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
    private static final List<String> HAPPY_PATH = List.of(
            "CODE_COMPLETE",
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
        return toResponse(projectRepository.findBySlug(normalizeSlug(slug))
                .orElseThrow(() -> new NoSuchElementException("Luna delivery project not found.")));
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

        if (current.equals(target)) {
            return toResponse(project);
        }

        assertLegalTransition(current, target);
        LocalDateTime now = LocalDateTime.now();
        project.setDeliveryState(target);
        project.setLastAttemptAt(now);

        if (FAILURE_ORIGINS.containsKey(target)) {
            String failureCode = required(request.failureCode(), "failureCode", 80);
            String failureReason = required(request.failureReason(), "failureReason", 2000);
            project.setLastFailureCode(failureCode);
            project.setLastFailureReason(failureReason);
            project.setRetryCount(Math.max(0, project.getRetryCount()) + 1);
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
            if (!failureOrigins.contains(current)) {
                throw illegalTransition(current, target);
            }
            return;
        }

        String retryTarget = RETRY_TARGETS.get(current);
        if (retryTarget != null) {
            if (!retryTarget.equals(target)) {
                throw illegalTransition(current, target);
            }
            return;
        }

        int currentIndex = HAPPY_PATH.indexOf(current);
        int targetIndex = HAPPY_PATH.indexOf(target);
        if (currentIndex < 0 || targetIndex != currentIndex + 1) {
            throw illegalTransition(current, target);
        }
    }

    private IllegalStateException illegalTransition(String current, String target) {
        return new IllegalStateException(
                "Illegal Luna delivery state transition: " + current + " -> " + target
        );
    }

    private String normalizeSlug(String value) {
        String slug = required(value, "slug", 160).toLowerCase();
        if (!SLUG_PATTERN.matcher(slug).matches()) {
            throw new IllegalArgumentException("Luna delivery slug format is invalid.");
        }
        return slug;
    }

    private String normalizePublicUrl(String value, String slug) {
        String canonical = "https://bloombouquet.https.gsmsv.site/apps/" + slug + "/";
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) {
            return canonical;
        }
        if (normalized.length() > 500) {
            throw new IllegalArgumentException("publicUrl exceeds the allowed length.");
        }
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
        if (normalized.isBlank()) {
            throw new IllegalArgumentException(label + " is required.");
        }
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(label + " exceeds the allowed length.");
        }
        return normalized;
    }

    private ProjectStateResponse toResponse(LunaDeliveryProject project) {
        return new ProjectStateResponse(
                project.getId(),
                project.getSlug(),
                project.getRepositoryFullName(),
                project.getMainSha(),
                project.getManifestDigest(),
                project.getAdoptionState(),
                project.getDeliveryState(),
                project.getPublicUrl(),
                project.getActiveReleaseSha(),
                project.getPreviousHealthyReleaseSha(),
                project.getLastLocalHealth(),
                project.getLastPublicHealth(),
                project.getBloomTeamId(),
                project.getBloomProjectId(),
                project.getBloomSubmissionId(),
                project.getBloomEvaluationRunId(),
                project.getLastFailureCode(),
                project.getLastFailureReason(),
                project.getRetryCount(),
                project.getLastAttemptAt(),
                project.getNextRetryAt()
        );
    }
}
