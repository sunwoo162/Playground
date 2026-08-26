package com.playground.domain.builder.controller;

import com.playground.domain.builder.dto.BuilderWorkerDto;
import com.playground.domain.builder.service.BuilderWorkerRunService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.NoSuchElementException;

@RestController
@RequestMapping("/internal/builder/worker")
@RequiredArgsConstructor
public class BuilderWorkerController {
    private final BuilderWorkerRunService service;

    @PostMapping("/runs/claim")
    public ResponseEntity<BuilderWorkerDto.ClaimResponse> claim(
            @RequestBody BuilderWorkerDto.ClaimRequest request
    ) {
        return service.claimNext(request == null ? null : request.getWorkerId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/runs/{runId}/heartbeat")
    public ResponseEntity<BuilderWorkerDto.RunStateResponse> heartbeat(
            @PathVariable Long runId,
            @RequestBody BuilderWorkerDto.HeartbeatRequest request
    ) {
        return ResponseEntity.ok(service.heartbeat(runId, request == null ? null : request.getWorkerId()));
    }

    @PostMapping("/runs/{runId}/complete")
    public ResponseEntity<BuilderWorkerDto.RunStateResponse> complete(
            @PathVariable Long runId,
            @RequestBody BuilderWorkerDto.CompleteRequest request
    ) {
        if (request == null) {
            throw new IllegalArgumentException("완료 요청이 비어 있습니다.");
        }
        return ResponseEntity.ok(service.complete(
                runId,
                request.getWorkerId(),
                request.getRepositoryFullName(),
                request.getPreviewUrl()
        ));
    }

    @PostMapping("/runs/{runId}/fail")
    public ResponseEntity<BuilderWorkerDto.RunStateResponse> fail(
            @PathVariable Long runId,
            @RequestBody BuilderWorkerDto.FailRequest request
    ) {
        if (request == null) {
            throw new IllegalArgumentException("실패 요청이 비어 있습니다.");
        }
        return ResponseEntity.ok(service.fail(runId, request.getWorkerId(), request.getFailureReason()));
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
