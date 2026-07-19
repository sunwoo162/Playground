package com.playground.domain.devhub.repository;

import com.playground.domain.devhub.entity.DevHubServer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DevHubServerRepository extends JpaRepository<DevHubServer, Long> {
    boolean existsBySlug(String slug);
}
