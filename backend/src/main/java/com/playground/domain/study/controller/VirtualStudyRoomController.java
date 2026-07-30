package com.playground.domain.study.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.study.service.VirtualStudyRoomService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/virtual-study-room")
@RequiredArgsConstructor
public class VirtualStudyRoomController {

    private final VirtualStudyRoomService virtualStudyRoomService;

    @GetMapping("/status")
    public ResponseEntity<Map<String, Boolean>> status() {
        return ResponseEntity.ok(Map.of("available", true));
    }

    @PostMapping("/invite")
    public ResponseEntity<Map<String, Boolean>> inviteFriend(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        virtualStudyRoomService.inviteFriend(
            auth.getUserId(),
            body.get("targetUserId"),
            body.get("roomId")
        );
        return ResponseEntity.ok(Map.of("success", true));
    }
}
