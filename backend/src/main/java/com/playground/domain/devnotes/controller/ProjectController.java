package com.playground.domain.devnotes.controller;

import com.playground.domain.devnotes.dto.ProjectDto;
import com.playground.domain.devnotes.service.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dev-notes/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    private String getUserId(OAuth2User user) {
        Object id = user.getAttribute("id");
        return id != null ? String.valueOf(id) : "";
    }

    @GetMapping
    public ResponseEntity<List<ProjectDto.Response>> getProjects(
            @AuthenticationPrincipal OAuth2User user) {
        return ResponseEntity.ok(projectService.getProjects(getUserId(user)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProjectDto.Response> getProject(
            @PathVariable Long id,
            @AuthenticationPrincipal OAuth2User user) {
        return ResponseEntity.ok(projectService.getProject(id, getUserId(user)));
    }

    @PostMapping
    public ResponseEntity<ProjectDto.Response> createProject(
            @RequestBody ProjectDto.Request req,
            @AuthenticationPrincipal OAuth2User user) {
        return ResponseEntity.ok(projectService.createProject(getUserId(user), req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ProjectDto.Response> updateProject(
            @PathVariable Long id,
            @RequestBody ProjectDto.Request req,
            @AuthenticationPrincipal OAuth2User user) {
        return ResponseEntity.ok(projectService.updateProject(id, getUserId(user), req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Boolean>> deleteProject(
            @PathVariable Long id,
            @AuthenticationPrincipal OAuth2User user) {
        projectService.deleteProject(id, getUserId(user));
        return ResponseEntity.ok(Map.of("success", true));
    }
}
