package com.playground.domain.bloombouquet.repository;

import com.playground.domain.bloombouquet.entity.BloomBouquetAgentEvaluation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BloomBouquetAgentEvaluationRepository extends JpaRepository<BloomBouquetAgentEvaluation, Long> {
    boolean existsByRunIdAndAgentRole(Long runId, String agentRole);
    List<BloomBouquetAgentEvaluation> findByRunIdOrderByIdAsc(Long runId);
}
