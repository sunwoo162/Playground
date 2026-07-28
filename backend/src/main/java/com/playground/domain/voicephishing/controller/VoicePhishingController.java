package com.playground.domain.voicephishing.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.voicephishing.dto.VoicePhishingDto;
import com.playground.domain.voicephishing.service.VoicePhishingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/voice-phishing")
@RequiredArgsConstructor
public class VoicePhishingController {
    private final VoicePhishingService service;

    @PostMapping("/sessions")
    public ResponseEntity<VoicePhishingDto.SessionResponse> createSession(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody VoicePhishingDto.CreateSessionRequest req) {
        return ResponseEntity.ok(service.create(auth.getUserId(), req));
    }

    @GetMapping("/sessions/recent")
    public ResponseEntity<List<VoicePhishingDto.SessionResponse>> getRecent(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(service.getRecent(auth.getUserId()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(e.getMessage());
    }
}
