package com.playground.domain.devhub.dto;

import java.time.LocalDateTime;

public class DevHubDto {
    public record CreateServerRequest(String name, String description, String githubOrg) {
    }

    public record UpdateGithubOrgRequest(String githubOrg) {
    }

    public record SendMessageRequest(String content) {
    }

    public record DirectMessageResponse(
            Long id,
            String friendId,
            String authorLogin,
            String content,
            LocalDateTime createdAt
    ) {
    }

    public record ServerResponse(
            Long id,
            String name,
            String slug,
            String githubOrg,
            String description,
            String ownerLogin,
            LocalDateTime createdAt
    ) {
    }

    public record MessageResponse(
            Long id,
            Long serverId,
            String authorLogin,
            String content,
            LocalDateTime createdAt
    ) {
    }
}
