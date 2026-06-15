package com.playground.domain.user.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @Column(name = "github_id")
    private String githubId; // GitHub user ID (String으로 저장)

    @Column(nullable = false)
    private String login; // GitHub 아이디

    private String name; // 표시 이름

    private String avatarUrl; // 프로필 사진 URL

    @CreationTimestamp
    private LocalDateTime createdAt;

    private LocalDateTime lastLoginAt;
}
