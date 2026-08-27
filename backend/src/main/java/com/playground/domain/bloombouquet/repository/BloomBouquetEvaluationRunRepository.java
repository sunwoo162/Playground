package com.playground.domain.bloombouquet.repository;

import com.playground.domain.bloombouquet.entity.BloomBouquetEvaluationRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BloomBouquetEvaluationRunRepository extends JpaRepository<BloomBouquetEvaluationRun, Long> {
    Optional<BloomBouquetEvaluationRun> findTopBySubmissionIdOrderByCreatedAtDesc(Long submissionId);
    Optional<BloomBouquetEvaluationRun> findFirstByStatusOrderByCreatedAtAsc(String status);
}
