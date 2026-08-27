package com.playground.domain.bloombouquet.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.bloombouquet.dto.BloomBouquetDto;
import com.playground.domain.bloombouquet.service.BloomBouquetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/bloom-bouquet")
@RequiredArgsConstructor
public class BloomBouquetController {
    private final BloomBouquetService service;

    @PostMapping("/teams")
    public ResponseEntity<BloomBouquetDto.TeamResponse> createTeam(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody BloomBouquetDto.CreateTeamRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createTeam(auth.getUserId(), request));
    }

    @GetMapping("/teams")
    public ResponseEntity<List<BloomBouquetDto.TeamResponse>> listTeams(
            @AuthenticationPrincipal JwtAuthenticationToken auth
    ) {
        return ResponseEntity.ok(service.listTeams(auth.getUserId()));
    }

    @PostMapping("/projects")
    public ResponseEntity<BloomBouquetDto.ProjectResponse> createProject(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody BloomBouquetDto.CreateProjectRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createProject(auth.getUserId(), request));
    }

    @PostMapping("/projects/{projectId}/submissions")
    public ResponseEntity<BloomBouquetDto.SubmissionResponse> publishSubmission(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long projectId,
            @RequestBody BloomBouquetDto.CreateSubmissionRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.publishSubmission(auth.getUserId(), projectId, request));
    }

    @GetMapping("/public/projects")
    public ResponseEntity<List<BloomBouquetDto.ProjectResponse>> listPublicProjects() {
        return ResponseEntity.ok(service.listPublicProjects());
    }

    @GetMapping("/public/projects/{projectId}")
    public ResponseEntity<BloomBouquetDto.ProjectDetailResponse> getPublicProject(@PathVariable Long projectId) {
        return ResponseEntity.ok(service.getPublicProject(projectId));
    }

    @GetMapping("/public/evaluations/{runId}")
    public ResponseEntity<BloomBouquetDto.EvaluationReportResponse> getPublicEvaluationReport(@PathVariable Long runId) {
        return ResponseEntity.ok(service.getPublicEvaluationReport(runId));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> badRequest(IllegalArgumentException error) {
        return ResponseEntity.badRequest().body(error.getMessage());
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<String> notFound(NoSuchElementException error) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error.getMessage());
    }
}
