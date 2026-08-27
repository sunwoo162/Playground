package com.playground.domain.bloombouquet.controller;

import com.playground.domain.bloombouquet.dto.BloomBouquetDto;
import com.playground.domain.bloombouquet.service.BloomBouquetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/internal/builder/worker/bloom-bouquet")
@RequiredArgsConstructor
public class BloomBouquetWorkerController {
    private static final String WORKER_ID_HEADER = "X-Bloom-Worker-Id";

    private final BloomBouquetService service;

    @PostMapping("/runs/claim")
    public ResponseEntity<BloomBouquetDto.EvaluationClaimResponse> claim(
            @RequestHeader(WORKER_ID_HEADER) String workerId
    ) {
        return service.claimNextEvaluation(workerId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/runs/{runId}/heartbeat")
    public ResponseEntity<BloomBouquetDto.EvaluationLeaseResponse> heartbeat(
            @PathVariable Long runId,
            @RequestHeader(WORKER_ID_HEADER) String workerId
    ) {
        return ResponseEntity.ok(service.heartbeatEvaluation(runId, workerId));
    }

    @PostMapping("/runs/{runId}/agents")
    public ResponseEntity<BloomBouquetDto.AgentEvaluationResponse> recordAgentEvaluation(
            @PathVariable Long runId,
            @RequestHeader(WORKER_ID_HEADER) String workerId,
            @RequestBody BloomBouquetDto.AgentEvaluationRequest request
    ) {
        return ResponseEntity.ok(service.recordAgentEvaluation(runId, workerId, request));
    }

    @GetMapping("/runs/{runId}/agents")
    public ResponseEntity<List<BloomBouquetDto.AgentEvaluationResponse>> getAgentEvaluations(@PathVariable Long runId) {
        return ResponseEntity.ok(service.getAgentEvaluations(runId));
    }

    @PostMapping("/runs/{runId}/complete")
    public ResponseEntity<BloomBouquetDto.SubmissionResponse> complete(
            @PathVariable Long runId,
            @RequestHeader(WORKER_ID_HEADER) String workerId,
            @RequestBody BloomBouquetDto.CompleteEvaluationRequest request
    ) {
        return ResponseEntity.ok(service.completeEvaluation(runId, workerId, request));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> badRequest(IllegalArgumentException error) {
        return ResponseEntity.badRequest().body(error.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<String> conflict(IllegalStateException error) {
        return ResponseEntity.status(409).body(error.getMessage());
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<String> notFound(NoSuchElementException error) {
        return ResponseEntity.notFound().build();
    }
}
