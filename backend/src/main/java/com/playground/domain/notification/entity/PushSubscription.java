package com.playground.domain.notification.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "push_subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PushSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(nullable = false, unique = true, length = 512)
    private String endpoint;

    @Column(name = "p256dh", nullable = false, length = 256)
    private String p256dh;

    @Column(name = "auth_key", nullable = false, length = 64)
    private String authKey;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
