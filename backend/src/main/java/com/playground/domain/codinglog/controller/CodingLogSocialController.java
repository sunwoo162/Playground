package com.playground.domain.codinglog.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.codinglog.entity.CodingLogComment;
import com.playground.domain.codinglog.entity.CodingLogLike;
import com.playground.domain.codinglog.repository.CodingLogCommentRepository;
import com.playground.domain.codinglog.repository.CodingLogLikeRepository;
import com.playground.domain.user.entity.User;
import com.playground.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/coding-log")
@RequiredArgsConstructor
public class CodingLogSocialController {

    private final CodingLogLikeRepository likeRepo;
    private final CodingLogCommentRepository commentRepo;
    private final UserRepository userRepo;

    // ── 좋아요 ──────────────────────────────────────────

    @PostMapping("/{logId}/like")
    public ResponseEntity<Map<String, Object>> toggleLike(
            @PathVariable Long logId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        String userId = auth.getUserId();
        boolean liked;
        if (likeRepo.existsByLogIdAndUserId(logId, userId)) {
            likeRepo.findByLogIdAndUserId(logId, userId).ifPresent(likeRepo::delete);
            liked = false;
        } else {
            likeRepo.save(CodingLogLike.builder().logId(logId).userId(userId).build());
            liked = true;
        }
        return ResponseEntity.ok(Map.of("liked", liked, "count", likeRepo.countByLogId(logId)));
    }

    @GetMapping("/{logId}/like")
    public ResponseEntity<Map<String, Object>> getLike(
            @PathVariable Long logId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(Map.of(
            "liked", likeRepo.existsByLogIdAndUserId(logId, auth.getUserId()),
            "count", likeRepo.countByLogId(logId)
        ));
    }

    // ── 댓글 ──────────────────────────────────────────

    @GetMapping("/{logId}/comments")
    public ResponseEntity<List<Map<String, Object>>> getComments(@PathVariable Long logId) {
        return ResponseEntity.ok(
            commentRepo.findByLogIdOrderByCreatedAtAsc(logId).stream().map(c -> {
                User u = userRepo.findById(c.getUserId()).orElse(null);
                return Map.<String, Object>of(
                    "id", c.getId(),
                    "userId", c.getUserId(),
                    "userLogin", u != null ? u.getLogin() : c.getUserId(),
                    "userAvatarUrl", u != null && u.getAvatarUrl() != null ? u.getAvatarUrl() : "",
                    "content", c.getContent(),
                    "createdAt", c.getCreatedAt().toString()
                );
            }).collect(Collectors.toList())
        );
    }

    @PostMapping("/{logId}/comments")
    public ResponseEntity<Map<String, Object>> addComment(
            @PathVariable Long logId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        String content = body.get("content");
        if (content == null || content.trim().isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "content required"));
        CodingLogComment c = commentRepo.save(CodingLogComment.builder()
            .logId(logId).userId(auth.getUserId()).content(content.trim()).build());
        User u = userRepo.findById(auth.getUserId()).orElse(null);
        return ResponseEntity.ok(Map.of(
            "id", c.getId(),
            "userId", c.getUserId(),
            "userLogin", u != null ? u.getLogin() : auth.getUserId(),
            "userAvatarUrl", u != null && u.getAvatarUrl() != null ? u.getAvatarUrl() : "",
            "content", c.getContent(),
            "createdAt", c.getCreatedAt().toString()
        ));
    }

    @DeleteMapping("/comments/{commentId}")
    public ResponseEntity<Map<String, Boolean>> deleteComment(
            @PathVariable Long commentId,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        commentRepo.deleteByIdAndUserId(commentId, auth.getUserId());
        return ResponseEntity.ok(Map.of("success", true));
    }
}
