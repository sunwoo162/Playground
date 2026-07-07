package com.playground.domain.study.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.study.service.StudyGroupService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/study/groups")
@RequiredArgsConstructor
public class StudyGroupController {

    private final StudyGroupService groupService;

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getMyGroups(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(groupService.getMyGroups(auth.getUserId()));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createGroup(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(groupService.createGroup(
            auth.getUserId(), body.get("name"), body.get("description")));
    }

    @PostMapping("/{groupId}/invite/{targetUserId}")
    public ResponseEntity<Map<String, Boolean>> invite(
            @PathVariable Long groupId,
            @PathVariable String targetUserId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        groupService.inviteMember(groupId, auth.getUserId(), targetUserId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @DeleteMapping("/{groupId}/leave")
    public ResponseEntity<Map<String, Boolean>> leave(
            @PathVariable Long groupId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        groupService.leaveGroup(groupId, auth.getUserId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/{groupId}/ranking")
    public ResponseEntity<List<Map<String, Object>>> getRanking(
            @PathVariable Long groupId,
            @RequestParam(defaultValue = "week") String period,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(groupService.getRanking(groupId, auth.getUserId(), period));
    }
}
