package com.playground.domain.bloombouquet.service;

import com.playground.domain.bloombouquet.dto.BloomBouquetDto;
import com.playground.domain.bloombouquet.entity.*;
import com.playground.domain.bloombouquet.repository.*;
import com.playground.domain.bouquetauth.service.BouquetAuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class BloomBouquetService {
    private static final String BOUQUET_AUTH_POLICY = "bouquet";
    private static final String DEFAULT_BOUQUET_CALLBACK_PATH = "/auth/bouquet/callback";
    private static final Pattern SLUG_PATTERN = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*");
    private static final Set<String> BASE_EVALUATORS = Set.of(
            "user-a", "user-b", "ux-research", "frontend", "security",
            "accessibility", "performance", "qa", "documentation"
    );
    private static final Set<String> ALLOWED_EVALUATORS = Set.of(
            "user-a", "user-b", "ux-research", "frontend", "backend", "security",
            "accessibility", "performance", "qa", "documentation", "code-review"
    );

    private final BloomBouquetTeamRepository teamRepository;
    private final BloomBouquetProjectRepository projectRepository;
    private final BloomBouquetSubmissionRepository submissionRepository;
    private final BloomBouquetEvaluationRunRepository runRepository;
    private final BloomBouquetAgentEvaluationRepository agentEvaluationRepository;
    private final BouquetAuthService bouquetAuthService;

    @Transactional
    public BloomBouquetDto.TeamResponse createTeam(String ownerId, BloomBouquetDto.CreateTeamRequest request) {
        String name = required(request.getName(), "team name", 120);
        String slug = normalizeSlug(request.getSlug(), name);
        if (teamRepository.existsByOwnerIdAndSlug(ownerId, slug)) {
            throw new IllegalArgumentException("같은 slug의 팀이 이미 존재합니다.");
        }
        BloomBouquetTeam team = teamRepository.save(BloomBouquetTeam.builder()
                .ownerId(ownerId).name(name).slug(slug).build());
        return toTeamResponse(team);
    }

    @Transactional(readOnly = true)
    public List<BloomBouquetDto.TeamResponse> listTeams(String ownerId) {
        return teamRepository.findByOwnerIdOrderByCreatedAtDesc(ownerId).stream()
                .map(this::toTeamResponse).toList();
    }

    @Transactional
    public BloomBouquetDto.ProjectResponse createProject(String ownerId, BloomBouquetDto.CreateProjectRequest request) {
        BloomBouquetTeam team = teamRepository.findByIdAndOwnerId(request.getTeamId(), ownerId)
                .orElseThrow(() -> new NoSuchElementException("팀을 찾을 수 없습니다."));
        String name = required(request.getName(), "project name", 160);
        String slug = normalizeSlug(request.getSlug(), name);
        if (projectRepository.existsByTeamIdAndSlug(team.getId(), slug)) {
            throw new IllegalArgumentException("같은 팀에 동일한 project slug가 이미 존재합니다.");
        }
        BloomBouquetProject project = projectRepository.save(BloomBouquetProject.builder()
                .team(team)
                .name(name)
                .slug(slug)
                .description(required(request.getDescription(), "description", 4000))
                .published(false)
                .build());
        return toProjectResponse(project);
    }

    @Transactional
    public BloomBouquetDto.SubmissionResponse publishSubmission(
            String ownerId,
            Long projectId,
            BloomBouquetDto.CreateSubmissionRequest request
    ) {
        BloomBouquetProject project = projectRepository.findByIdAndTeamOwnerId(projectId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("프로젝트를 찾을 수 없습니다."));
        String version = required(request.getVersion(), "version", 80);
        if (submissionRepository.existsByProjectIdAndVersion(projectId, version)) {
            throw new IllegalArgumentException("이미 등록된 프로젝트 버전입니다.");
        }
        String demoUrl = validateUrl(request.getDemoUrl(), "demoUrl", request.isRequiresAuth());
        String frontendRepositoryUrl = optionalUrl(request.getFrontendRepositoryUrl());
        String backendRepositoryUrl = optionalUrl(request.getBackendRepositoryUrl());

        BloomBouquetSubmission submission = submissionRepository.save(BloomBouquetSubmission.builder()
                .project(project)
                .version(version)
                .demoUrl(demoUrl)
                .frontendRepositoryUrl(frontendRepositoryUrl)
                .backendRepositoryUrl(backendRepositoryUrl)
                .requiresAuth(request.isRequiresAuth())
                .authPolicyId(BOUQUET_AUTH_POLICY)
                .build());

        if (submission.isRequiresAuth()) {
            String redirectUri = validateAuthRedirectUri(demoUrl, request.getAuthRedirectUri());
            String clientId = "bouquet-submission-" + submission.getId();
            bouquetAuthService.registerClient(clientId, oauthClientDisplayName(project, version), redirectUri);
            submission.setBouquetClientId(clientId);
            submission.setBouquetRedirectUri(redirectUri);
            submissionRepository.save(submission);
        }

        BloomBouquetEvaluationRun run = runRepository.save(BloomBouquetEvaluationRun.builder()
                .submission(submission)
                .status("QUEUED")
                .build());
        project.setPublished(true);
        projectRepository.save(project);
        return toSubmissionResponse(submission, run);
    }

    @Transactional(readOnly = true)
    public List<BloomBouquetDto.ProjectResponse> listPublicProjects() {
        return projectRepository.findByPublishedTrueOrderByUpdatedAtDesc().stream()
                .map(this::toProjectResponse).toList();
    }

    @Transactional(readOnly = true)
    public BloomBouquetDto.ProjectDetailResponse getPublicProject(Long projectId) {
        BloomBouquetProject project = projectRepository.findById(projectId)
                .filter(BloomBouquetProject::isPublished)
                .orElseThrow(() -> new NoSuchElementException("프로젝트를 찾을 수 없습니다."));
        List<BloomBouquetDto.SubmissionResponse> submissions = submissionRepository
                .findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .map(submission -> toSubmissionResponse(submission,
                        runRepository.findTopBySubmissionIdOrderByCreatedAtDesc(submission.getId()).orElse(null)))
                .toList();
        return BloomBouquetDto.ProjectDetailResponse.builder()
                .project(toProjectResponse(project))
                .submissions(submissions)
                .build();
    }

    @Transactional(readOnly = true)
    public BloomBouquetDto.EvaluationReportResponse getPublicEvaluationReport(Long runId) {
        BloomBouquetEvaluationRun run = runRepository.findById(runId)
                .filter(item -> item.getSubmission().getProject().isPublished())
                .orElseThrow(() -> new NoSuchElementException("평가 보고서를 찾을 수 없습니다."));
        return BloomBouquetDto.EvaluationReportResponse.builder()
                .runId(run.getId())
                .status(run.getStatus())
                .overallScore(run.getOverallScore())
                .overallStars(run.getOverallStars())
                .reportSummary(run.getReportSummary())
                .agentEvaluations(agentEvaluationRepository.findByRunIdOrderByIdAsc(runId).stream()
                        .map(this::toAgentEvaluationResponse).toList())
                .startedAt(run.getStartedAt())
                .completedAt(run.getCompletedAt())
                .build();
    }

    @Transactional
    public Optional<BloomBouquetDto.EvaluationClaimResponse> claimNextEvaluation() {
        Optional<BloomBouquetEvaluationRun> candidate = runRepository.findFirstByStatusOrderByCreatedAtAsc("QUEUED");
        if (candidate.isEmpty()) return Optional.empty();
        BloomBouquetEvaluationRun run = candidate.get();
        run.setStatus("RUNNING");
        run.setStartedAt(LocalDateTime.now());
        runRepository.save(run);
        BloomBouquetSubmission submission = run.getSubmission();
        BloomBouquetProject project = submission.getProject();
        BloomBouquetTeam team = project.getTeam();
        return Optional.of(BloomBouquetDto.EvaluationClaimResponse.builder()
                .runId(run.getId()).submissionId(submission.getId()).projectId(project.getId()).teamId(team.getId())
                .projectName(project.getName()).teamName(team.getName()).version(submission.getVersion())
                .demoUrl(submission.getDemoUrl()).frontendRepositoryUrl(submission.getFrontendRepositoryUrl())
                .backendRepositoryUrl(submission.getBackendRepositoryUrl()).requiresAuth(submission.isRequiresAuth())
                .authPolicyId(submission.getAuthPolicyId())
                .bouquetClientId(submission.getBouquetClientId()).bouquetRedirectUri(submission.getBouquetRedirectUri())
                .build());
    }

    @Transactional
    public BloomBouquetDto.AgentEvaluationResponse recordAgentEvaluation(
            Long runId,
            BloomBouquetDto.AgentEvaluationRequest request
    ) {
        BloomBouquetEvaluationRun run = runRepository.findById(runId)
                .orElseThrow(() -> new NoSuchElementException("평가 Run을 찾을 수 없습니다."));
        if (!"RUNNING".equals(run.getStatus())) {
            throw new IllegalArgumentException("RUNNING 상태의 평가에만 Agent 결과를 기록할 수 있습니다.");
        }
        String role = required(request.getAgentRole(), "agentRole", 60);
        if (!ALLOWED_EVALUATORS.contains(role)) {
            throw new IllegalArgumentException("허용되지 않은 평가 Agent 역할입니다: " + role);
        }
        if (agentEvaluationRepository.existsByRunIdAndAgentRole(runId, role)) {
            throw new IllegalArgumentException("해당 Agent의 독립 평가가 이미 기록되었습니다.");
        }
        int score = requireRange(request.getScore(), 0, 100, "score");
        double stars = requireRange(request.getStars(), 1.0, 5.0, "stars");
        BloomBouquetAgentEvaluation evaluation = agentEvaluationRepository.save(BloomBouquetAgentEvaluation.builder()
                .run(run).agentRole(role).score(score).stars(stars)
                .assessment(required(request.getAssessment(), "assessment", 20000))
                .evidence(join(request.getEvidence()))
                .severity(required(request.getSeverity(), "severity", 20))
                .impact(required(request.getImpact(), "impact", 20000))
                .recommendation(required(request.getRecommendation(), "recommendation", 20000))
                .priority(required(request.getPriority(), "priority", 10))
                .confidence(required(request.getConfidence(), "confidence", 20))
                .technicalTerms(join(request.getTechnicalTerms()))
                .build());
        return toAgentEvaluationResponse(evaluation);
    }

    @Transactional(readOnly = true)
    public List<BloomBouquetDto.AgentEvaluationResponse> getAgentEvaluations(Long runId) {
        if (!runRepository.existsById(runId)) {
            throw new NoSuchElementException("평가 Run을 찾을 수 없습니다."));
        }
        return agentEvaluationRepository.findByRunIdOrderByIdAsc(runId).stream()
                .map(this::toAgentEvaluationResponse).toList();
    }

    @Transactional
    public BloomBouquetDto.SubmissionResponse completeEvaluation(
            Long runId,
            BloomBouquetDto.CompleteEvaluationRequest request
    ) {
        BloomBouquetEvaluationRun run = runRepository.findById(runId)
                .orElseThrow(() -> new NoSuchElementException("평가 Run을 찾을 수 없습니다."));
        if (!"RUNNING".equals(run.getStatus())) {
            throw new IllegalArgumentException("RUNNING 상태의 평가만 완료할 수 있습니다.");
        }
        Set<String> completedRoles = new HashSet<>(agentEvaluationRepository.findByRunIdOrderByIdAsc(runId).stream()
                .map(BloomBouquetAgentEvaluation::getAgentRole).toList());
        Set<String> requiredRoles = expectedEvaluators(run.getSubmission());
        if (!completedRoles.containsAll(requiredRoles)) {
            Set<String> missing = new TreeSet<>(requiredRoles);
            missing.removeAll(completedRoles);
            throw new IllegalArgumentException("Process Evaluator 실행 전 독립 평가가 부족합니다: " + String.join(", ", missing));
        }
        run.setOverallScore(requireRange(request.getOverallScore(), 0, 100, "overallScore"));
        run.setOverallStars(requireRange(request.getOverallStars(), 1.0, 5.0, "overallStars"));
        run.setReportSummary(required(request.getReportSummary(), "reportSummary", 60000));
        run.setStatus("COMPLETED");
        run.setCompletedAt(LocalDateTime.now());
        runRepository.save(run);
        return toSubmissionResponse(run.getSubmission(), run);
    }

    private Set<String> expectedEvaluators(BloomBouquetSubmission submission) {
        Set<String> roles = new HashSet<>(BASE_EVALUATORS);
        if (submission.getBackendRepositoryUrl() != null) roles.add("backend");
        if (submission.getFrontendRepositoryUrl() != null || submission.getBackendRepositoryUrl() != null) {
            roles.add("code-review");
        }
        return roles;
    }

    private BloomBouquetDto.TeamResponse toTeamResponse(BloomBouquetTeam team) {
        return BloomBouquetDto.TeamResponse.builder()
                .id(team.getId()).name(team.getName()).slug(team.getSlug()).createdAt(team.getCreatedAt()).build();
    }

    private BloomBouquetDto.ProjectResponse toProjectResponse(BloomBouquetProject project) {
        BloomBouquetDto.SubmissionResponse latest = submissionRepository.findTopByProjectIdOrderByCreatedAtDesc(project.getId())
                .map(submission -> toSubmissionResponse(submission,
                        runRepository.findTopBySubmissionIdOrderByCreatedAtDesc(submission.getId()).orElse(null)))
                .orElse(null);
        return BloomBouquetDto.ProjectResponse.builder()
                .id(project.getId()).teamId(project.getTeam().getId()).teamName(project.getTeam().getName())
                .name(project.getName()).slug(project.getSlug()).description(project.getDescription())
                .published(project.isPublished()).latestSubmission(latest)
                .createdAt(project.getCreatedAt()).updatedAt(project.getUpdatedAt()).build();
    }

    private BloomBouquetDto.SubmissionResponse toSubmissionResponse(
            BloomBouquetSubmission submission,
            BloomBouquetEvaluationRun run
    ) {
        return BloomBouquetDto.SubmissionResponse.builder()
                .id(submission.getId()).version(submission.getVersion()).demoUrl(submission.getDemoUrl())
                .frontendRepositoryUrl(submission.getFrontendRepositoryUrl())
                .backendRepositoryUrl(submission.getBackendRepositoryUrl())
                .requiresAuth(submission.isRequiresAuth()).authPolicyId(submission.getAuthPolicyId())
                .bouquetClientId(submission.getBouquetClientId()).bouquetRedirectUri(submission.getBouquetRedirectUri())
                .evaluationRunId(run == null ? null : run.getId())
                .evaluationStatus(run == null ? null : run.getStatus())
                .overallScore(run == null ? null : run.getOverallScore())
                .overallStars(run == null ? null : run.getOverallStars())
                .createdAt(submission.getCreatedAt()).build();
    }

    private BloomBouquetDto.AgentEvaluationResponse toAgentEvaluationResponse(BloomBouquetAgentEvaluation evaluation) {
        return BloomBouquetDto.AgentEvaluationResponse.builder()
                .agentRole(evaluation.getAgentRole()).score(evaluation.getScore()).stars(evaluation.getStars())
                .assessment(evaluation.getAssessment()).evidence(split(evaluation.getEvidence()))
                .severity(evaluation.getSeverity()).impact(evaluation.getImpact())
                .recommendation(evaluation.getRecommendation()).priority(evaluation.getPriority())
                .confidence(evaluation.getConfidence()).technicalTerms(split(evaluation.getTechnicalTerms()))
                .createdAt(evaluation.getCreatedAt()).build();
    }

    private String normalizeSlug(String requested, String fallback) {
        String value = requested == null || requested.isBlank() ? fallback : requested;
        String slug = value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        if (!SLUG_PATTERN.matcher(slug).matches()) {
            throw new IllegalArgumentException("slug는 영문 소문자, 숫자, 하이픈 형식이어야 합니다.");
        }
        return slug;
    }

    private String validateUrl(String raw, String field, boolean requireHttps) {
        String value = required(raw, field, 600);
        URI uri;
        try { uri = URI.create(value); } catch (Exception error) {
            throw new IllegalArgumentException(field + " 형식이 올바르지 않습니다.");
        }
        if (uri.getHost() == null || uri.getScheme() == null || uri.getUserInfo() != null) {
            throw new IllegalArgumentException(field + " 형식이 올바르지 않습니다.");
        }
        if (requireHttps && !"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("꽃다발 인증을 사용하는 프로젝트는 HTTPS demoUrl이 필요합니다.");
        }
        return value;
    }

    private String validateAuthRedirectUri(String demoUrl, String requestedRedirectUri) {
        URI demo = URI.create(demoUrl);
        String value = requestedRedirectUri == null || requestedRedirectUri.isBlank()
                ? demo.getScheme() + "://" + demo.getRawAuthority() + DEFAULT_BOUQUET_CALLBACK_PATH
                : required(requestedRedirectUri, "authRedirectUri", 2048);

        URI redirect;
        try {
            redirect = URI.create(value);
        } catch (Exception error) {
            throw new IllegalArgumentException("authRedirectUri 형식이 올바르지 않습니다.");
        }
        if (!"https".equalsIgnoreCase(redirect.getScheme())
                || redirect.getHost() == null
                || redirect.getUserInfo() != null
                || redirect.getFragment() != null) {
            throw new IllegalArgumentException("꽃다발 authRedirectUri는 fragment가 없는 HTTPS URL이어야 합니다.");
        }
        if (!sameOrigin(demo, redirect)) {
            throw new IllegalArgumentException("꽃다발 authRedirectUri는 demoUrl과 같은 origin이어야 합니다.");
        }
        return value;
    }

    private boolean sameOrigin(URI left, URI right) {
        return left.getScheme().equalsIgnoreCase(right.getScheme())
                && left.getHost().equalsIgnoreCase(right.getHost())
                && effectivePort(left) == effectivePort(right);
    }

    private int effectivePort(URI uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private String oauthClientDisplayName(BloomBouquetProject project, String version) {
        String value = project.getName() + " · " + version;
        return value.length() <= 100 ? value : value.substring(0, 100);
    }

    private String optionalUrl(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return validateUrl(raw, "repositoryUrl", true);
    }

    private String required(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " 값이 필요합니다.");
        String trimmed = value.trim();
        if (trimmed.length() > maxLength) throw new IllegalArgumentException(field + " 값이 너무 깁니다.");
        return trimmed;
    }

    private int requireRange(Integer value, int min, int max, String field) {
        if (value == null || value < min || value > max) {
            throw new IllegalArgumentException(field + " 범위는 " + min + "~" + max + "입니다.");
        }
        return value;
    }

    private double requireRange(Double value, double min, double max, String field) {
        if (value == null || value < min || value > max) {
            throw new IllegalArgumentException(field + " 범위는 " + min + "~" + max + "입니다.");
        }
        return Math.round(value * 10.0) / 10.0;
    }

    private String join(List<String> values) {
        if (values == null || values.isEmpty()) return "";
        return values.stream().filter(Objects::nonNull).map(String::trim).filter(value -> !value.isBlank())
                .reduce((left, right) -> left + "\n" + right).orElse("");
    }

    private List<String> split(String value) {
        if (value == null || value.isBlank()) return List.of();
        return Arrays.stream(value.split("\\R")).filter(item -> !item.isBlank()).toList();
    }
}