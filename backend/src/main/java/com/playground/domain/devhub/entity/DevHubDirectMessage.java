package com.playground.domain.devhub.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "dev_hub_direct_messages",
        indexes = @Index(name = "idx_dev_hub_dm_pair_created", columnList = "room_key, created_at")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DevHubDirectMessage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_key", nullable = false, length = 180)
    private String roomKey;

    @Column(nullable = false, length = 80)
    private String senderId;

    @Column(nullable = false, length = 80)
    private String senderLogin;

    @Column(nullable = false, length = 80)
    private String receiverId;

    @Column(nullable = false, length = 2000)
    private String content;

    @Column(nullable = false)
    @Builder.Default
    private boolean deleted = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean pinned = false;

    @Column(nullable = false, length = 1000)
    @Builder.Default
    private String reactions = "";

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
