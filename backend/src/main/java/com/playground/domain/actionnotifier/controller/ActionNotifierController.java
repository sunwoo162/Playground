package com.playground.domain.actionnotifier.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.actionnotifier.dto.ActionNotifierDto;
import com.playground.domain.actionnotifier.service.ActionNotifierService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/action-notifier")
@RequiredArgsConstructor
public class ActionNotifierController {

    private final ActionNotifierService actionNotifierService;

    @GetMapping("/repos")
    public ResponseEntity<List<ActionNotifierDto.WatchResponse>> list(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(actionNotifierService.list(auth.getUserId()));
    }

    @PostMapping("/repos")
    public ResponseEntity<?> connect(
            @RequestBody ActionNotifierDto.ConnectRequest request,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        try {
            return ResponseEntity.ok(actionNotifierService.connect(auth.getUserId(), request.getRepository()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/repos/{id}/runs")
    public ResponseEntity<?> runs(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        try {
            return ResponseEntity.ok(actionNotifierService.runs(auth.getUserId(), id));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/repos/{id}")
    public ResponseEntity<?> delete(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        actionNotifierService.delete(auth.getUserId(), id);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PatchMapping("/repos/{id}/notification")
    public ResponseEntity<?> updateNotification(
            @PathVariable Long id,
            @RequestBody ActionNotifierDto.NotificationRequest request,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        try {
            return ResponseEntity.ok(actionNotifierService.updateNotification(auth.getUserId(), id, request.getEnabled()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
