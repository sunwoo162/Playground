package com.playground.domain.bloombouquet.controller;

import com.playground.domain.bloombouquet.dto.BloomBouquetDto;
import com.playground.domain.bloombouquet.service.BloomBouquetDevelopmentHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/builder/worker/harness-history")
@RequiredArgsConstructor
public class BloomBouquetDevelopmentHistoryController {
    private final BloomBouquetDevelopmentHistoryService developmentHistoryService;

    @PutMapping("/projects/{projectId}")
    public ResponseEntity<BloomBouquetDto.DevelopmentHistoryResponse> upsert(
            @PathVariable Long projectId,
            @RequestBody BloomBouquetDto.DevelopmentHistoryUpsertRequest request
    ) {
        return ResponseEntity.ok(developmentHistoryService.upsert(projectId, request));
    }
}
