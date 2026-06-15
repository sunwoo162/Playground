package com.playground.config;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;
import java.util.Map;

public class JwtAuthenticationToken extends AbstractAuthenticationToken {

    private final String userId;
    private final Map<String, Object> attributes;

    public JwtAuthenticationToken(String id, String login, String name, String avatarUrl) {
        super(List.of(new SimpleGrantedAuthority("ROLE_USER")));
        this.userId = id;
        this.attributes = Map.of(
                "id", id,
                "login", login != null ? login : "",
                "name", name != null ? name : "",
                "avatar_url", avatarUrl != null ? avatarUrl : ""
        );
        setAuthenticated(true);
    }

    public String getUserId() { return userId; }
    public Map<String, Object> getAttributes() { return attributes; }

    @Override
    public Object getCredentials() { return null; }

    @Override
    public Object getPrincipal() { return userId; }
}
