package com.playground.domain.devhub.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.devhub.dto.DevHubDto.CreateServerRequest;
import com.playground.domain.devhub.dto.DevHubDto.DirectMessageResponse;
import com.playground.domain.devhub.dto.DevHubDto.MessageResponse;
import com.playground.domain.devhub.dto.DevHubDto.ReactionRequest;
import com.playground.domain.devhub.dto.DevHubDto.SendMessageRequest;
import com.playground.domain.devhub.dto.DevHubDto.ServerResponse;
import com.playground.domain.devhub.dto.DevHubDto.UpdateGithubOrgRequest;
import com.playground.domain.devhub.service.DevHubService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dev-hub")
@RequiredArgsConstructor
public class DevHubController {
    private final DevHubService devHubService;

    @GetMapping("/servers")
    public ResponseEntity<List<ServerResponse>> servers(@AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(devHubService.servers(auth));
    }

    @PostMapping("/servers")
    public ResponseEntity<ServerResponse> createServer(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody CreateServerRequest request
    ) {
        return ResponseEntity.ok(devHubService.createServer(auth, request));
    }

    @PatchMapping("/servers/{serverId}/github-org")
    public ResponseEntity<ServerResponse> updateGithubOrg(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long serverId,
            @RequestBody UpdateGithubOrgRequest request
    ) {
        return ResponseEntity.ok(devHubService.updateGithubOrg(auth, serverId, request));
    }

    @GetMapping("/servers/{serverId}/messages")
    public ResponseEntity<List<MessageResponse>> messages(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long serverId,
            @RequestParam(required = false) Long afterId
    ) {
        return ResponseEntity.ok(devHubService.messages(auth, serverId, afterId));
    }

    @PostMapping("/servers/{serverId}/messages")
    public ResponseEntity<MessageResponse> sendMessage(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long serverId,
            @RequestBody SendMessageRequest request
    ) {
        return ResponseEntity.ok(devHubService.sendMessage(auth, serverId, request));
    }

    @PostMapping("/servers/{serverId}/messages/{messageId}/delete")
    public ResponseEntity<MessageResponse> deleteMessage(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long serverId,
            @PathVariable Long messageId
    ) {
        return ResponseEntity.ok(devHubService.deleteMessage(auth, serverId, messageId));
    }

    @PostMapping("/servers/{serverId}/messages/{messageId}/pin")
    public ResponseEntity<MessageResponse> toggleMessagePin(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long serverId,
            @PathVariable Long messageId
    ) {
        return ResponseEntity.ok(devHubService.toggleMessagePin(auth, serverId, messageId));
    }

    @PostMapping("/servers/{serverId}/messages/{messageId}/reaction")
    public ResponseEntity<MessageResponse> reactToMessage(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long serverId,
            @PathVariable Long messageId,
            @RequestBody ReactionRequest request
    ) {
        return ResponseEntity.ok(devHubService.reactToMessage(auth, serverId, messageId, request));
    }

    @PostMapping("/servers/{serverId}/messages/{messageId}/forward")
    public ResponseEntity<MessageResponse> forwardMessage(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long serverId,
            @PathVariable Long messageId
    ) {
        return ResponseEntity.ok(devHubService.forwardMessage(auth, serverId, messageId));
    }

    @GetMapping("/dm/{friendId}/messages")
    public ResponseEntity<List<DirectMessageResponse>> directMessages(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable String friendId,
            @RequestParam(required = false) Long afterId
    ) {
        return ResponseEntity.ok(devHubService.directMessages(auth, friendId, afterId));
    }

    @PostMapping("/dm/{friendId}/messages")
    public ResponseEntity<DirectMessageResponse> sendDirectMessage(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable String friendId,
            @RequestBody SendMessageRequest request
    ) {
        return ResponseEntity.ok(devHubService.sendDirectMessage(auth, friendId, request));
    }

    @PostMapping("/dm/{friendId}/messages/{messageId}/delete")
    public ResponseEntity<DirectMessageResponse> deleteDirectMessage(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable String friendId,
            @PathVariable Long messageId
    ) {
        return ResponseEntity.ok(devHubService.deleteDirectMessage(auth, friendId, messageId));
    }

    @PostMapping("/dm/{friendId}/messages/{messageId}/pin")
    public ResponseEntity<DirectMessageResponse> toggleDirectMessagePin(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable String friendId,
            @PathVariable Long messageId
    ) {
        return ResponseEntity.ok(devHubService.toggleDirectMessagePin(auth, friendId, messageId));
    }

    @PostMapping("/dm/{friendId}/messages/{messageId}/reaction")
    public ResponseEntity<DirectMessageResponse> reactToDirectMessage(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable String friendId,
            @PathVariable Long messageId,
            @RequestBody ReactionRequest request
    ) {
        return ResponseEntity.ok(devHubService.reactToDirectMessage(auth, friendId, messageId, request));
    }

    @PostMapping("/dm/{friendId}/messages/{messageId}/forward")
    public ResponseEntity<DirectMessageResponse> forwardDirectMessage(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable String friendId,
            @PathVariable Long messageId
    ) {
        return ResponseEntity.ok(devHubService.forwardDirectMessage(auth, friendId, messageId));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException error) {
        return ResponseEntity.badRequest().body(Map.of("error", error.getMessage()));
    }
}
