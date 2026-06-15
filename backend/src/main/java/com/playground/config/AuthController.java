package com.playground.config;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @GetMapping("/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal OAuth2User user) {
        if (user == null) {
            return ResponseEntity.ok(Map.of("user", null));
        }
        return ResponseEntity.ok(Map.of("user", Map.of(
                "id", String.valueOf(user.getAttribute("id")),
                "login", user.getAttribute("login"),
                "name", user.getAttribute("name") != null ? user.getAttribute("name") : user.getAttribute("login"),
                "avatar_url", user.getAttribute("avatar_url")
        )));
    }
}
