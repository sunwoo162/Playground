package com.playground.domain.codinglog.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.codinglog.dto.CodingLogDto;
import com.playground.domain.codinglog.service.CodingLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/coding-log")
@RequiredArgsConstructor
public class CodingLogController {

    private final CodingLogService codingLogService;

    // 내 로그 목록
    @GetMapping("/my")
    public ResponseEntity<List<CodingLogDto.Response>> getMyLogs(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(codingLogService.getMyLogs(auth.getUserId()));
    }

    // 공개 로그 전체
    @GetMapping("/public")
    public ResponseEntity<List<CodingLogDto.Response>> getPublicLogs(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(codingLogService.getPublicLogs(auth.getUserId()));
    }

    // 생성
    @PostMapping
    public ResponseEntity<CodingLogDto.Response> create(
            @RequestBody CodingLogDto.Request req,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(codingLogService.create(auth.getUserId(), req));
    }

    // 수정
    @PutMapping("/{id}")
    public ResponseEntity<CodingLogDto.Response> update(
            @PathVariable Long id,
            @RequestBody CodingLogDto.Request req,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(codingLogService.update(id, auth.getUserId(), req));
    }

    // 삭제
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Boolean>> delete(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        codingLogService.delete(id, auth.getUserId());
        return ResponseEntity.ok(Map.of("success", true));
    }
}
