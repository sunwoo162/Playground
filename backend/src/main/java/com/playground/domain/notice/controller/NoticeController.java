package com.playground.domain.notice.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.notice.dto.NoticeDto;
import com.playground.domain.notice.service.NoticeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notices")
@RequiredArgsConstructor
public class NoticeController {
    private final NoticeService service;

    @GetMapping
    public ResponseEntity<List<NoticeDto.Response>> list() {
        return ResponseEntity.ok(service.list());
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Boolean>> me(@AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(Map.of("admin", auth != null && service.isAdmin(auth.getUserId())));
    }

    @PostMapping
    public ResponseEntity<NoticeDto.Response> create(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody NoticeDto.CreateRequest req) {
        return ResponseEntity.ok(service.create(auth.getUserId(), req));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(e.getMessage());
    }
}
