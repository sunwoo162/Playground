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
        Object idAttr = user.getAttribute("id");
        String id = idAttr != null ? String.valueOf(idAttr) : "";
        Object nameAttr = user.getAttribute("name");
        String name = nameAttr != null ? String.valueOf(nameAttr) : String.valueOf(user.getAttribute("login"));

        return ResponseEntity.ok(Map.of("user", Map.of(
                "id", id,
                "login", String.valueOf(user.getAttribute("login")),
                "name", name,
                "avatar_url", String.valueOf(user.getAttribute("avatar_url"))
        )));
    }
}
