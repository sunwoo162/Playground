package com.playground.domain.feature.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.feature.dto.FeatureRequestDto;
import com.playground.domain.feature.service.FeatureRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/feature-requests")
@RequiredArgsConstructor
public class FeatureRequestController {
    private final FeatureRequestService service;

    @PostMapping
    public ResponseEntity<FeatureRequestDto.Response> create(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody FeatureRequestDto.CreateRequest req) {
        return ResponseEntity.ok(service.create(auth.getUserId(), req));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(e.getMessage());
    }
}
