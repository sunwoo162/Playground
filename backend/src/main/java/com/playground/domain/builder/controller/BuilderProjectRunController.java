package com.playground.domain.builder.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.builder.dto.BuilderProjectRunDto;
import com.playground.domain.builder.service.BuilderProjectRunService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/builder/projects/{projectId}/runs")
@RequiredArgsConstructor
public class BuilderProjectRunController {
    private final BuilderProjectRunService service;

    @PostMapping
    public ResponseEntity<BuilderProjectRunDto.Response> requestRun(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long projectId) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(service.requestRun(auth.getUserId(), projectId));
    }

    @GetMapping
    public ResponseEntity<List<BuilderProjectRunDto.Response>> listRuns(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long projectId) {
        return ResponseEntity.ok(service.listRuns(auth.getUserId(), projectId));
    }

    @GetMapping("/{runId}")
    public ResponseEntity<BuilderProjectRunDto.Response> getRun(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long projectId,
            @PathVariable Long runId) {
        return ResponseEntity.ok(service.getRun(auth.getUserId(), projectId, runId));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> badRequest(IllegalArgumentException error) {
        return ResponseEntity.badRequest().body(error.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<String> conflict(IllegalStateException error) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error.getMessage());
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<String> notFound(NoSuchElementException error) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error.getMessage());
    }
}
