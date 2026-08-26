package com.playground.domain.builder.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.builder.dto.BuilderProjectDto;
import com.playground.domain.builder.service.BuilderProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/builder/projects")
@RequiredArgsConstructor
public class BuilderProjectController {
    private final BuilderProjectService service;

    @PostMapping
    public ResponseEntity<BuilderProjectDto.Response> create(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody BuilderProjectDto.CreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(auth.getUserId(), request));
    }

    @GetMapping
    public ResponseEntity<List<BuilderProjectDto.Response>> list(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(service.list(auth.getUserId()));
    }

    @GetMapping("/{projectId}")
    public ResponseEntity<BuilderProjectDto.Response> get(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long projectId) {
        return ResponseEntity.ok(service.get(auth.getUserId(), projectId));
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
