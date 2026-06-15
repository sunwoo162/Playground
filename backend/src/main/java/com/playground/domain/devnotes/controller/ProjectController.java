package com.playground.domain.devnotes.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.devnotes.dto.ProjectDto;
import com.playground.domain.devnotes.service.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dev-notes/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    public ResponseEntity<List<ProjectDto.Response>> getProjects(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(projectService.getProjects(auth.getUserId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProjectDto.Response> getProject(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(projectService.getProject(id, auth.getUserId()));
    }

    @PostMapping
    public ResponseEntity<ProjectDto.Response> createProject(
            @RequestBody ProjectDto.Request req,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(projectService.createProject(auth.getUserId(), req));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ProjectDto.Response> updateProject(
            @PathVariable Long id,
            @RequestBody ProjectDto.Request req,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(projectService.updateProject(id, auth.getUserId(), req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Boolean>> deleteProject(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        projectService.deleteProject(id, auth.getUserId());
        return ResponseEntity.ok(Map.of("success", true));
    }
}
