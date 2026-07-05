package com.playground.domain.codinglog.repository;

import com.playground.domain.codinglog.entity.CodingLogComment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CodingLogCommentRepository extends JpaRepository<CodingLogComment, Long> {
    List<CodingLogComment> findByLogIdOrderByCreatedAtAsc(Long logId);
    void deleteByIdAndUserId(Long id, String userId);
}
