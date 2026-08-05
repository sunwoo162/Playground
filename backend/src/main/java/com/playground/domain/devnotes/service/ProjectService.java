package com.playground.domain.devnotes.service;

import com.playground.domain.devnotes.dto.ProjectDto;
import com.playground.domain.devnotes.entity.*;
import com.playground.domain.devnotes.repository.ProjectRepository;
import com.playground.domain.devnotes.repository.ProjectShareRepository;
import com.playground.domain.user.entity.User;
import com.playground.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectShareRepository projectShareRepository;
    private final UserRepository userRepository;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.node-url:http://localhost:3000}")
    private String nodeUrl;

    // ── 목록 조회 (내 프로젝트 + 공유받은 프로젝트) ──────────
    public List<ProjectDto.Response> getProjects(String userId) {
        List<Project> myProjects = projectRepository.findByUserIdOrderByUpdatedAtDesc(userId);
        List<Project> sharedProjects = projectShareRepository.findAcceptedByUserId(userId, ProjectShare.Status.ACCEPTED).stream()
            .map(ps -> ps.getProject())
            .collect(Collectors.toList());

        return Stream.concat(myProjects.stream(), sharedProjects.stream())
            .distinct()
            .sorted(Comparator.comparing(Project::getUpdatedAt).reversed())
            .map(p -> toResponse(p, userId))
            .collect(Collectors.toList());
    }

    // ── 단건 조회 ──────────────────────────────────────────
    public ProjectDto.Response getProject(Long id, String userId) {
        Project project = getAccessibleProject(id, userId);
        return toResponse(project, userId);
    }

    // ── 생성 ───────────────────────────────────────────────
    @Transactional
    public ProjectDto.Response createProject(String userId, ProjectDto.Request req) {
        validateProjectRequest(userId, req);
        Project project = Project.builder()
                .userId(userId)
                .title(clean(req.getTitle(), 180))
                .description(cleanNullableText(req.getDescription()))
                .overview(req.getOverview())
                .build();
        return toResponse(projectRepository.save(project), userId);
    }

    // ── 수정 (소유자 + 공유 팀원 모두 가능) ───────────────────
    @Transactional
    public ProjectDto.Response updateProject(Long id, String userId, ProjectDto.Request req) {
        validateProjectRequest(userId, req);
        Project project = getAccessibleProject(id, userId);

        project.setTitle(clean(req.getTitle(), 180));
        project.setDescription(cleanNullableText(req.getDescription()));
        project.setOverview(req.getOverview());

        project.getFeatureSpecs().clear();
        if (req.getSpec() != null) {
            req.getSpec().forEach(s -> project.getFeatureSpecs().add(
                FeatureSpec.builder()
                    .project(project)
                    .title(clean(s.getTitle(), 180))
                    .description(cleanNullableText(s.getDescription()))
                    .priority(parsePriority(s.getPriority()))
                    .status(parseFeatureStatus(s.getStatus()))
                    .build()
            ));
        }

        project.getApiSpecs().clear();
        if (req.getApi() != null) {
            req.getApi().forEach(a -> project.getApiSpecs().add(
                ApiSpec.builder()
                    .project(project)
                    .method(parseHttpMethod(a.getMethod()))
                    .endpoint(clean(a.getEndpoint(), 240))
                    .description(cleanNullableText(a.getDescription()))
                    .headers(a.getHeaders())
                    .queryParams(a.getQueryParams())
                    .requestBody(a.getRequestBody())
                    .responseBody(a.getResponseBody())
                    .build()
            ));
        }

        project.getUserAnalyses().clear();
        if (req.getUsers() != null) {
            req.getUsers().forEach(u -> project.getUserAnalyses().add(
                UserAnalysis.builder()
                    .project(project)
                    .persona(cleanNullableText(u.getPersona()))
                    .goal(cleanNullableText(u.getGoal()))
                    .painPoint(cleanNullableText(u.getPainPoint()))
                    .build()
            ));
        }

        // 수정 알림 - 수정자 제외 모든 팀원에게 발송
        sendUpdateNotification(project, userId);

        return toResponse(project, userId);
    }

    // ── 삭제 (소유자만) ────────────────────────────────────
    @Transactional
    public void deleteProject(Long id, String userId) {
        Project project = projectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Project not found or no permission"));
        projectRepository.delete(project);
    }

    // ── 공유 추가 ──────────────────────────────────────────
    @Transactional
    public void shareProject(Long projectId, String ownerId, String targetUserId) {
        requireUserId(ownerId);
        targetUserId = clean(targetUserId, 64);
        Project project = projectRepository.findByIdAndUserId(projectId, ownerId)
                .orElseThrow(() -> new RuntimeException("Project not found or no permission"));

        if (ownerId.equals(targetUserId)) throw new IllegalArgumentException("자기 자신과 공유 불가");

        userRepository.findById(targetUserId)
                .orElseThrow(() -> new RuntimeException("존재하지 않는 유저"));

        projectShareRepository.findByProjectIdAndUserId(projectId, targetUserId)
                .ifPresent(s -> { throw new IllegalStateException("이미 공유된 유저"); });

        projectShareRepository.save(ProjectShare.builder()
                .project(project)
                .userId(targetUserId)
                .status(ProjectShare.Status.PENDING)
                .build());

        // 공유 초대 알림
        User owner = userRepository.findById(ownerId).orElse(null);
        String ownerName = owner != null ? (owner.getName() != null ? owner.getName() : owner.getLogin()) : ownerId;
        sendPush(targetUserId, "프로젝트 공유 초대",
            ownerName + "님이 '" + project.getTitle() + "' 프로젝트 공유에 초대했어요!",
            "/apps/dev-notes/");
    }

    public List<Map<String, String>> getShareInvitations(String userId) {
        return projectShareRepository.findByUserIdAndStatus(userId, ProjectShare.Status.PENDING).stream()
            .map(ps -> {
                Project project = ps.getProject();
                User owner = userRepository.findById(project.getUserId()).orElse(null);
                Map<String, String> m = new HashMap<>();
                m.put("shareId", String.valueOf(ps.getId()));
                m.put("projectId", String.valueOf(project.getId()));
                m.put("projectTitle", project.getTitle());
                m.put("ownerId", project.getUserId());
                m.put("ownerLogin", owner != null ? owner.getLogin() : project.getUserId());
                m.put("ownerName", owner != null ? owner.getName() : project.getUserId());
                m.put("ownerAvatarUrl", owner != null ? owner.getAvatarUrl() : null);
                m.put("createdAt", ps.getCreatedAt() != null ? ps.getCreatedAt().toString() : "");
                return m;
            })
            .collect(Collectors.toList());
    }

    @Transactional
    public void acceptShareInvitation(Long shareId, String userId) {
        ProjectShare share = projectShareRepository.findById(shareId)
            .orElseThrow(() -> new RuntimeException("Invitation not found"));
        if (!share.getUserId().equals(userId)) throw new IllegalArgumentException("No permission");
        share.setStatus(ProjectShare.Status.ACCEPTED);
    }

    @Transactional
    public void rejectShareInvitation(Long shareId, String userId) {
        ProjectShare share = projectShareRepository.findById(shareId)
            .orElseThrow(() -> new RuntimeException("Invitation not found"));
        if (!share.getUserId().equals(userId)) throw new IllegalArgumentException("No permission");
        projectShareRepository.delete(share);
    }

    // ── 공유 취소 ──────────────────────────────────────────
    @Transactional
    public void unshareProject(Long projectId, String ownerId, String targetUserId) {
        projectRepository.findByIdAndUserId(projectId, ownerId)
                .orElseThrow(() -> new RuntimeException("Project not found or no permission"));
        projectShareRepository.deleteByProjectIdAndUserId(projectId, targetUserId);
    }

    // 공유 목록 조회 - 소유자 포함
    public List<Map<String, String>> getSharedUsers(Long projectId, String userId) {
        Project project = getAccessibleProject(projectId, userId);
        
        List<Map<String, String>> result = new ArrayList<>();
        
        // 소유자 추가
        User owner = userRepository.findById(project.getUserId()).orElse(null);
        if (owner != null) {
            Map<String, String> ownerMap = new HashMap<>();
            ownerMap.put("userId", owner.getGithubId());
            ownerMap.put("login", owner.getLogin());
            ownerMap.put("name", owner.getName());
            ownerMap.put("avatarUrl", owner.getAvatarUrl());
            ownerMap.put("role", "OWNER");
            result.add(ownerMap);
        }
        
        // 공유받은 팀원 추가
        projectShareRepository.findAcceptedByProjectId(projectId, ProjectShare.Status.ACCEPTED).forEach(ps -> {
            User u = userRepository.findById(ps.getUserId()).orElse(null);
            Map<String, String> m = new HashMap<>();
            m.put("userId", ps.getUserId());
            m.put("login", u != null ? u.getLogin() : ps.getUserId());
            m.put("name", u != null ? u.getName() : null);
            m.put("avatarUrl", u != null ? u.getAvatarUrl() : null);
            m.put("role", "EDITOR");
            result.add(m);
        });

        projectShareRepository.findByProjectId(projectId).stream()
            .filter(ps -> ps.getStatus() == ProjectShare.Status.PENDING)
            .forEach(ps -> {
                User u = userRepository.findById(ps.getUserId()).orElse(null);
                Map<String, String> m = new HashMap<>();
                m.put("userId", ps.getUserId());
                m.put("login", u != null ? u.getLogin() : ps.getUserId());
                m.put("name", u != null ? u.getName() : null);
                m.put("avatarUrl", u != null ? u.getAvatarUrl() : null);
                m.put("role", "PENDING");
                result.add(m);
            });
        
        return result;
    }

    // ── 접근 가능한 프로젝트 조회 (소유자 or 공유받은 사람) ──
    private Project getAccessibleProject(Long id, String userId) {
        requireUserId(userId);
        return projectRepository.findById(id)
            .filter(p -> p.getUserId().equals(userId) ||
                        projectShareRepository.existsAcceptedByProjectIdAndUserId(id, userId, ProjectShare.Status.ACCEPTED))
            .orElseThrow(() -> new RuntimeException("Project not found or no permission"));
    }

    private void validateProjectRequest(String userId, ProjectDto.Request req) {
        requireUserId(userId);
        if (req == null) {
            throw new IllegalArgumentException("요청 본문이 필요합니다.");
        }
        if (req.getTitle() == null || req.getTitle().isBlank()) {
            throw new IllegalArgumentException("프로젝트 제목을 입력해주세요.");
        }
        if (req.getSpec() != null) {
            req.getSpec().forEach(spec -> {
                if (spec.getTitle() == null || spec.getTitle().isBlank()) {
                    throw new IllegalArgumentException("기능 제목을 입력해주세요.");
                }
                parsePriority(spec.getPriority());
                parseFeatureStatus(spec.getStatus());
            });
        }
        if (req.getApi() != null) {
            req.getApi().forEach(api -> {
                parseHttpMethod(api.getMethod());
                if (api.getEndpoint() == null || api.getEndpoint().isBlank()) {
                    throw new IllegalArgumentException("API endpoint를 입력해주세요.");
                }
            });
        }
    }

    private void requireUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("사용자 정보가 필요합니다.");
        }
    }

    private FeatureSpec.Priority parsePriority(String value) {
        try {
            return FeatureSpec.Priority.valueOf(clean(value, 20));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("지원하지 않는 기능 우선순위입니다.");
        }
    }

    private FeatureSpec.Status parseFeatureStatus(String value) {
        try {
            return FeatureSpec.Status.valueOf(clean(value, 20).replace("-", "_"));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("지원하지 않는 기능 상태입니다.");
        }
    }

    private ApiSpec.HttpMethod parseHttpMethod(String value) {
        try {
            return ApiSpec.HttpMethod.valueOf(clean(value, 10).toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("지원하지 않는 HTTP method입니다.");
        }
    }

    private String clean(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("필수 입력값이 비어 있습니다.");
        }
        String cleaned = value.trim();
        return cleaned.length() > maxLength ? cleaned.substring(0, maxLength) : cleaned;
    }

    private String cleanNullableText(String value) {
        return value == null ? null : value.trim();
    }

    // ── 수정 알림 발송 ─────────────────────────────────────
    private void sendUpdateNotification(Project project, String editorId) {
        try {
            User editor = userRepository.findById(editorId).orElse(null);
            String editorName = editor != null ? (editor.getName() != null ? editor.getName() : editor.getLogin()) : editorId;

            // 알림 받을 사람: 소유자 + 공유 팀원 - 수정자
            Set<String> recipients = new HashSet<>();
            recipients.add(project.getUserId());
            projectShareRepository.findAcceptedByProjectId(project.getId(), ProjectShare.Status.ACCEPTED)
                .forEach(ps -> recipients.add(ps.getUserId()));
            recipients.remove(editorId); // 수정자 제외

            for (String recipientId : recipients) {
                sendPush(recipientId, "프로젝트 수정됨",
                    editorName + "님이 '" + project.getTitle() + "' 프로젝트를 수정했어요.",
                    "/apps/dev-notes/");
            }
        } catch (Exception e) {
            log.warn("Update notification failed: {}", e.getMessage());
        }
    }

    // ── Web Push 발송 ──────────────────────────────────────
    private void sendPush(String userId, String title, String body, String url) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, String> payload = Map.of(
                "userId", userId, "title", title, "body", body, "url", url
            );
            restTemplate.postForEntity(nodeUrl + "/internal/push/send",
                new HttpEntity<>(payload, headers), String.class);
        } catch (Exception e) {
            log.warn("Push failed for {}: {}", userId, e.getMessage());
        }
    }

    // ── Response 변환 ──────────────────────────────────────
    private ProjectDto.Response toResponse(Project p, String currentUserId) {
        List<String> sharedWith = projectShareRepository.findAcceptedByProjectId(p.getId(), ProjectShare.Status.ACCEPTED)
            .stream().map(ProjectShare::getUserId).collect(Collectors.toList());

        return ProjectDto.Response.builder()
                .id(p.getId())
                .title(p.getTitle())
                .description(p.getDescription())
                .overview(p.getOverview())
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .ownerId(p.getUserId())
                .isOwner(p.getUserId().equals(currentUserId))
                .sharedWith(sharedWith)
                .spec(p.getFeatureSpecs().stream().map(s -> ProjectDto.FeatureSpecDto.builder()
                        .id(s.getId()).title(s.getTitle()).description(s.getDescription())
                        .priority(s.getPriority().name()).status(s.getStatus().name())
                        .build()).collect(Collectors.toList()))
                .api(p.getApiSpecs().stream().map(a -> ProjectDto.ApiSpecDto.builder()
                        .id(a.getId()).method(a.getMethod().name()).endpoint(a.getEndpoint())
                        .description(a.getDescription()).headers(a.getHeaders())
                        .queryParams(a.getQueryParams()).requestBody(a.getRequestBody())
                        .responseBody(a.getResponseBody()).build()).collect(Collectors.toList()))
                .users(p.getUserAnalyses().stream().map(u -> ProjectDto.UserAnalysisDto.builder()
                        .id(u.getId()).persona(u.getPersona()).goal(u.getGoal())
                        .painPoint(u.getPainPoint()).build()).collect(Collectors.toList()))
                .build();
    }
}
