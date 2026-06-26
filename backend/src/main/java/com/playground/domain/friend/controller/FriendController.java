package com.playground.domain.friend.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.friend.dto.FriendDto;
import com.playground.domain.friend.service.FriendService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/friends")
@RequiredArgsConstructor
public class FriendController {

    private final FriendService friendService;

    // 유저 검색
    @GetMapping("/search")
    public ResponseEntity<List<FriendDto.UserResponse>> search(
            @RequestParam String q,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(friendService.searchUsers(q, auth.getUserId()));
    }

    // 최근 가입자 목록
    @GetMapping("/recent")
    public ResponseEntity<List<FriendDto.UserResponse>> getRecentUsers(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(friendService.getRecentUsers(auth.getUserId()));
    }

    // 친구 요청 보내기
    @PostMapping("/request/{receiverId}")
    public ResponseEntity<Map<String, Boolean>> sendRequest(
            @PathVariable String receiverId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        friendService.sendRequest(auth.getUserId(), receiverId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    // 받은 친구 요청 목록
    @GetMapping("/requests")
    public ResponseEntity<List<FriendDto.RequestResponse>> getRequests(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(friendService.getReceivedRequests(auth.getUserId()));
    }

    // 친구 요청 수락
    @PostMapping("/accept/{requestId}")
    public ResponseEntity<Map<String, Boolean>> accept(
            @PathVariable Long requestId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        friendService.acceptRequest(requestId, auth.getUserId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    // 친구 요청 거절
    @PostMapping("/reject/{requestId}")
    public ResponseEntity<Map<String, Boolean>> reject(
            @PathVariable Long requestId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        friendService.rejectRequest(requestId, auth.getUserId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    // 친구 목록
    @GetMapping
    public ResponseEntity<List<FriendDto.UserResponse>> getFriends(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(friendService.getFriends(auth.getUserId()));
    }

    // 친구 삭제
    @DeleteMapping("/{friendId}")
    public ResponseEntity<Map<String, Boolean>> removeFriend(
            @PathVariable String friendId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        friendService.removeFriend(auth.getUserId(), friendId);
        return ResponseEntity.ok(Map.of("success", true));
    }
}
