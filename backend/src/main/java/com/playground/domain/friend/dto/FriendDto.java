package com.playground.domain.friend.dto;

import lombok.*;

public class FriendDto {

    @Getter
    @Builder
    public static class UserResponse {
        private String githubId;
        private String login;
        private String name;
        private String avatarUrl;
        private String createdAt;
        private String friendStatus; // null, "PENDING_SENT", "PENDING_RECEIVED", "ACCEPTED"
    }

    @Getter
    @Builder
    public static class RequestResponse {
        private Long requestId;
        private String githubId;
        private String login;
        private String name;
        private String avatarUrl;
        private String createdAt;
    }
}
