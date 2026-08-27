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

import java.time.LocalDateTime;

@Entity
@Table(name = "bouquet_authorization_codes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BouquetAuthorizationCode {

    @Id
    @Column(length = 64)
    private String codeHash;

    @Column(nullable = false, length = 36)
    private String accountId;

    @Column(nullable = false, length = 64)
    private String clientId;

    @Column(nullable = false, length = 2048)
    private String redirectUri;

    @Column(nullable = false, length = 128)
    private String codeChallenge;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    @Column
    private LocalDateTime usedAt;
}
