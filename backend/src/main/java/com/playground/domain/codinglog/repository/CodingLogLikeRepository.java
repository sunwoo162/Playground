package com.playground.domain.codinglog.repository;

import com.playground.domain.codinglog.entity.CodingLogLike;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CodingLogLikeRepository extends JpaRepository<CodingLogLike, Long> {
    long countByLogId(Long logId);
    boolean existsByLogIdAndUserId(Long logId, String userId);
    Optional<CodingLogLike> findByLogIdAndUserId(Long logId, String userId);
}
