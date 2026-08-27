package com.playground.domain.bloombouquet.repository;

import com.playground.domain.bloombouquet.entity.BloomBouquetEvaluationRun;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface BloomBouquetEvaluationRunRepository extends JpaRepository<BloomBouquetEvaluationRun, Long> {
    Optional<BloomBouquetEvaluationRun> findTopBySubmissionIdOrderByCreatedAtDesc(Long submissionId);

    @Query(value = """
            SELECT run.*
            FROM bloom_bouquet_evaluation_runs run
            WHERE run.status = 'QUEUED'
               OR (
                    run.status = 'RUNNING'
                    AND run.lease_expires_at IS NOT NULL
                    AND run.lease_expires_at < CURRENT_TIMESTAMP
               )
            ORDER BY CASE WHEN run.status = 'QUEUED' THEN 0 ELSE 1 END, run.created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    Optional<BloomBouquetEvaluationRun> claimNextAvailableForUpdate();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select run from BloomBouquetEvaluationRun run where run.id = :runId")
    Optional<BloomBouquetEvaluationRun> findByIdForUpdate(@Param("runId") Long runId);
}
