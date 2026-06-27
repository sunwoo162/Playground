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

    // ── 공유 API ──────────────────────────────────────────

    @PostMapping("/{id}/share/{targetUserId}")
    public ResponseEntity<Map<String, Boolean>> shareProject(
            @PathVariable Long id,
            @PathVariable String targetUserId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        projectService.shareProject(id, auth.getUserId(), targetUserId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @DeleteMapping("/{id}/share/{targetUserId}")
    public ResponseEntity<Map<String, Boolean>> unshareProject(
            @PathVariable Long id,
            @PathVariable String targetUserId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        projectService.unshareProject(id, auth.getUserId(), targetUserId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/{id}/share")
    public ResponseEntity<List<Map<String, String>>> getSharedUsers(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(projectService.getSharedUsers(id, auth.getUserId()));
    }
}
