package com.playground.domain.bouquetauth.repository;

import com.playground.domain.bouquetauth.entity.BouquetOAuthClient;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BouquetOAuthClientRepository extends JpaRepository<BouquetOAuthClient, String> {
    Optional<BouquetOAuthClient> findByClientIdAndActiveTrue(String clientId);
}
