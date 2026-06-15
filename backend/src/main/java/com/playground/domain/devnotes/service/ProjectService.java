package com.playground.domain.devnotes.service;

import com.playground.domain.devnotes.dto.ProjectDto;
import com.playground.domain.devnotes.entity.*;
import com.playground.domain.devnotes.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProjectService {

    private final ProjectRepository projectRepository;

    public List<ProjectDto.Response> getProjects(String userId) {
        return projectRepository.findByUserIdOrderByUpdatedAtDesc(userId)
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    public ProjectDto.Response getProject(Long id, String userId) {
        Project project = projectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        return toResponse(project);
    }

    @Transactional
    public ProjectDto.Response createProject(String userId, ProjectDto.Request req) {
        Project project = Project.builder()
                .userId(userId)
                .title(req.getTitle())
                .description(req.getDescription())
                .overview(req.getOverview())
                .build();
        return toResponse(projectRepository.save(project));
    }

    @Transactional
    public ProjectDto.Response updateProject(Long id, String userId, ProjectDto.Request req) {
        Project project = projectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Project not found"));

        project.setTitle(req.getTitle());
        project.setDescription(req.getDescription());
        project.setOverview(req.getOverview());

        // feature specs 업데이트
        project.getFeatureSpecs().clear();
        if (req.getSpec() != null) {
            req.getSpec().forEach(s -> project.getFeatureSpecs().add(
                FeatureSpec.builder()
                    .project(project)
                    .title(s.getTitle())
                    .description(s.getDescription())
                    .priority(FeatureSpec.Priority.valueOf(s.getPriority()))
                    .status(FeatureSpec.Status.valueOf(s.getStatus().replace("-", "_")))
                    .build()
            ));
        }

        // api specs 업데이트
        project.getApiSpecs().clear();
        if (req.getApi() != null) {
            req.getApi().forEach(a -> project.getApiSpecs().add(
                ApiSpec.builder()
                    .project(project)
                    .method(ApiSpec.HttpMethod.valueOf(a.getMethod()))
                    .endpoint(a.getEndpoint())
                    .description(a.getDescription())
                    .requestBody(a.getRequestBody())
                    .responseBody(a.getResponseBody())
                    .build()
            ));
        }

        // user analyses 업데이트
        project.getUserAnalyses().clear();
        if (req.getUsers() != null) {
            req.getUsers().forEach(u -> project.getUserAnalyses().add(
                UserAnalysis.builder()
                    .project(project)
                    .persona(u.getPersona())
                    .goal(u.getGoal())
                    .painPoint(u.getPainPoint())
                    .build()
            ));
        }

        return toResponse(project);
    }

    @Transactional
    public void deleteProject(Long id, String userId) {
        Project project = projectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Project not found"));
        projectRepository.delete(project);
    }

    private ProjectDto.Response toResponse(Project p) {
        return ProjectDto.Response.builder()
                .id(p.getId())
                .title(p.getTitle())
                .description(p.getDescription())
                .overview(p.getOverview())
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .spec(p.getFeatureSpecs().stream().map(s -> ProjectDto.FeatureSpecDto.builder()
                        .id(s.getId()).title(s.getTitle()).description(s.getDescription())
                        .priority(s.getPriority().name()).status(s.getStatus().name())
                        .build()).collect(Collectors.toList()))
                .api(p.getApiSpecs().stream().map(a -> ProjectDto.ApiSpecDto.builder()
                        .id(a.getId()).method(a.getMethod().name()).endpoint(a.getEndpoint())
                        .description(a.getDescription()).requestBody(a.getRequestBody())
                        .responseBody(a.getResponseBody()).build()).collect(Collectors.toList()))
                .users(p.getUserAnalyses().stream().map(u -> ProjectDto.UserAnalysisDto.builder()
                        .id(u.getId()).persona(u.getPersona()).goal(u.getGoal())
                        .painPoint(u.getPainPoint()).build()).collect(Collectors.toList()))
                .build();
    }
}
