package com.playground.domain.bouquetauth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "bouquet_oauth_clients")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BouquetOAuthClient {

    @Id
    @Column(length = 64)
    private String clientId;

    @Column(nullable = false, length = 120)
    private String displayName;

    @Column(nullable = false, length = 2048)
    private String redirectUri;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
