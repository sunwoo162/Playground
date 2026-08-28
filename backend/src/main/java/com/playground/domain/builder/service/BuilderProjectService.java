package com.playground.domain.builder.service;

import com.playground.domain.builder.dto.BuilderProjectDto;
import com.playground.domain.builder.entity.BuilderProject;
import com.playground.domain.builder.repository.BuilderProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
public class BuilderProjectService {
    private static final int MAX_BRIEF_LENGTH = 4000;
    private static final int MAX_TITLE_LENGTH = 120;
    private static final Set<String> ALLOWED_PLATFORMS = Set.of("web", "mobile", "both");
    private static final Set<String> ALLOWED_FEATURES = Set.of(
            "auth", "search", "notifications", "admin", "payments", "maps", "uploads"
    );

    private final BuilderProjectRepository repository;

    @Transactional
    public BuilderProjectDto.Response create(String ownerId, BuilderProjectDto.CreateRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("프로젝트 요청이 비어 있습니다.");
        }

        String brief = normalizeBrief(request.getBrief());
        String platform = normalizePlatform(request.getPlatform());
        List<String> features = normalizeFeatures(request.getFeatures());
        String templateId = normalizeOptional(request.getTemplateId(), 160);

        BuilderProject project = repository.save(BuilderProject.builder()
                .ownerId(requireOwner(ownerId))
                .title(createTitle(brief))
                .brief(brief)
                .platform(platform)
                .featureKeys(String.join(",", features))
                .status("draft")
                .authRequired(features.contains("auth"))
                .templateId(templateId)
                .build());

        return toResponse(project);
    }

    @Transactional(readOnly = true)
    public List<BuilderProjectDto.Response> list(String ownerId) {
        return repository.findAllByOwnerIdOrderByCreatedAtDesc(requireOwner(ownerId))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public BuilderProjectDto.Response get(String ownerId, Long projectId) {
        if (projectId == null || projectId <= 0) {
            throw new IllegalArgumentException("프로젝트 ID가 올바르지 않습니다.");
        }
        BuilderProject project = repository.findByIdAndOwnerId(projectId, requireOwner(ownerId))
                .orElseThrow(() -> new NoSuchElementException("프로젝트를 찾을 수 없습니다."));
        return toResponse(project);
    }

    private String requireOwner(String ownerId) {
        String value = ownerId == null ? "" : ownerId.trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("로그인 사용자를 확인할 수 없습니다.");
        }
        if (value.length() > 120) {
            throw new IllegalArgumentException("사용자 식별자가 허용 범위를 초과했습니다.");
        }
        return value;
    }

    private String normalizeBrief(String brief) {
        String value = brief == null ? "" : brief.replaceAll("\\s+", " ").trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("만들고 싶은 서비스 아이디어를 입력해주세요.");
        }
        if (value.length() > MAX_BRIEF_LENGTH) {
            throw new IllegalArgumentException("아이디어 설명은 4000자 이하로 입력해주세요.");
        }
        return value;
    }

    private String normalizePlatform(String platform) {
        String value = platform == null ? "" : platform.trim().toLowerCase(Locale.ROOT);
        if (!ALLOWED_PLATFORMS.contains(value)) {
            throw new IllegalArgumentException("지원하지 않는 플랫폼입니다.");
        }
        return value;
    }

    private List<String> normalizeFeatures(List<String> features) {
        if (features == null || features.isEmpty()) {
            return List.of();
        }

        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String feature : features) {
            String value = feature == null ? "" : feature.trim().toLowerCase(Locale.ROOT);
            if (!ALLOWED_FEATURES.contains(value)) {
                throw new IllegalArgumentException("지원하지 않는 기능 옵션입니다: " + value);
            }
            normalized.add(value);
        }
        return List.copyOf(normalized);
    }

    private String normalizeOptional(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) {
            return null;
        }
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException("입력 값이 허용 길이를 초과했습니다.");
        }
        return normalized;
    }

    private String createTitle(String brief) {
        if (brief.length() <= MAX_TITLE_LENGTH) {
            return brief;
        }
        return brief.substring(0, MAX_TITLE_LENGTH - 1).trim() + "…";
    }

    private BuilderProjectDto.Response toResponse(BuilderProject project) {
        List<String> features = project.getFeatureKeys() == null || project.getFeatureKeys().isBlank()
                ? List.of()
                : Arrays.stream(project.getFeatureKeys().split(","))
                        .map(String::trim)
                        .filter(value -> !value.isBlank())
                        .toList();

        return BuilderProjectDto.Response.builder()
                .id(project.getId())
                .title(project.getTitle())
                .brief(project.getBrief())
                .platform(project.getPlatform())
                .features(features)
                .status(project.getStatus())
                .authRequired(project.isAuthRequired())
                .templateId(project.getTemplateId())
                .repositoryFullName(project.getRepositoryFullName())
                .previewUrl(project.getPreviewUrl())
                .bloomBouquetRegistrationUrl(project.getBloomBouquetRegistrationUrl())
                .createdAt(project.getCreatedAt())
                .updatedAt(project.getUpdatedAt())
                .build();
    }
}
