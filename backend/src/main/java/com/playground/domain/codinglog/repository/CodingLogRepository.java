package com.playground.domain.codinglog.repository;

import com.playground.domain.codinglog.entity.CodingLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CodingLogRepository extends JpaRepository<CodingLog, Long> {
    List<CodingLog> findByUserIdOrderByCreatedAtDesc(String userId);
    List<CodingLog> findByIsPublicTrueOrderByCreatedAtDesc();
    Optional<CodingLog> findByIdAndUserId(Long id, String userId);
}
