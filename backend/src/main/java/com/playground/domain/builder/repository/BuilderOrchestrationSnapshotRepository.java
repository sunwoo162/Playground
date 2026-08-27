package com.playground.domain.builder.repository;

import com.playground.domain.builder.entity.BuilderOrchestrationSnapshot;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface BuilderOrchestrationSnapshotRepository extends JpaRepository<BuilderOrchestrationSnapshot, Long> {
    Optional<BuilderOrchestrationSnapshot> findByRun_Id(Long runId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select snapshot from BuilderOrchestrationSnapshot snapshot where snapshot.run.id = :runId")
    Optional<BuilderOrchestrationSnapshot> findByRunIdForUpdate(@Param("runId") Long runId);
}
