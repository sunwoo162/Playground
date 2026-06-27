package com.playground.domain.notification.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.notification.entity.PushSubscription;
import com.playground.domain.notification.repository.PushSubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/push")
@RequiredArgsConstructor
public class PushController {

    private final PushSubscriptionRepository pushSubscriptionRepository;

    /**
     * POST /api/push/subscribe
     * 브라우저 구독 정보 저장
     */
    @PostMapping("/subscribe")
    public ResponseEntity<?> subscribe(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {

        String endpoint = (String) body.get("endpoint");
        @SuppressWarnings("unchecked")
        Map<String, String> keys = (Map<String, String>) body.get("keys");

        if (endpoint == null || keys == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_subscription"));
        }

        // 이미 있으면 업데이트, 없으면 저장
        pushSubscriptionRepository.findByEndpoint(endpoint).ifPresentOrElse(
            sub -> {
                sub.setP256dh(keys.get("p256dh"));
                sub.setAuthKey(keys.get("auth"));
                sub.setUserId(auth.getUserId());
                pushSubscriptionRepository.save(sub);
            },
            () -> pushSubscriptionRepository.save(PushSubscription.builder()
                .userId(auth.getUserId())
                .endpoint(endpoint)
                .p256dh(keys.get("p256dh"))
                .authKey(keys.get("auth"))
                .build())
        );

        log.info("Push subscription saved for userId: {}", auth.getUserId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    /**
     * DELETE /api/push/unsubscribe
     * 구독 해제
     */
    @DeleteMapping("/unsubscribe")
    public ResponseEntity<?> unsubscribe(
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        String endpoint = body.get("endpoint");
        if (endpoint != null) pushSubscriptionRepository.deleteByEndpoint(endpoint);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /**
     * GET /api/push/subscriptions/{userId}
     * Node.js 서버에서 내부적으로 호출 - 특정 유저의 구독 목록 반환
     */
    @GetMapping("/subscriptions/{userId}")
    public ResponseEntity<?> getSubscriptions(@PathVariable String userId) {
        return ResponseEntity.ok(pushSubscriptionRepository.findByUserId(userId));
    }
}
