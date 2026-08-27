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
    private final BloomBouquetService service;

    @PostMapping("/runs/claim")
    public ResponseEntity<BloomBouquetDto.EvaluationClaimResponse> claim() {
        return service.claimNextEvaluation()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/runs/{runId}/agents")
    public ResponseEntity<BloomBouquetDto.AgentEvaluationResponse> recordAgentEvaluation(
            @PathVariable Long runId,
            @RequestBody BloomBouquetDto.AgentEvaluationRequest request
    ) {
        return ResponseEntity.ok(service.recordAgentEvaluation(runId, request));
    }

    @GetMapping("/runs/{runId}/agents")
    public ResponseEntity<List<BloomBouquetDto.AgentEvaluationResponse>> getAgentEvaluations(@PathVariable Long runId) {
        return ResponseEntity.ok(service.getAgentEvaluations(runId));
    }

    @PostMapping("/runs/{runId}/complete")
    public ResponseEntity<BloomBouquetDto.SubmissionResponse> complete(
            @PathVariable Long runId,
            @RequestBody BloomBouquetDto.CompleteEvaluationRequest request
    ) {
        return ResponseEntity.ok(service.completeEvaluation(runId, request));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> badRequest(IllegalArgumentException error) {
        return ResponseEntity.badRequest().body(error.getMessage());
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<String> notFound(NoSuchElementException error) {
        return ResponseEntity.notFound().build();
    }
}
