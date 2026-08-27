package com.playground.domain.builder.repository;

import com.playground.domain.builder.entity.BuilderProjectRun;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface BuilderProjectRunRepository extends JpaRepository<BuilderProjectRun, Long> {
    Optional<BuilderProjectRun> findFirstByProject_IdAndOwnerIdAndStatusInOrderByCreatedAtDesc(
            Long projectId,
            String ownerId,
            Collection<String> statuses
    );

    List<BuilderProjectRun> findAllByProject_IdAndOwnerIdOrderByCreatedAtDesc(Long projectId, String ownerId);

    Optional<BuilderProjectRun> findByIdAndProject_IdAndOwnerId(Long id, Long projectId, String ownerId);

    @Query(value = """
            SELECT run.*
            FROM builder_project_runs run
            INNER JOIN builder_projects project ON project.id = run.project_id
            WHERE (run.status = 'queued' AND project.status = 'queued')
               OR (
                    run.status = 'running'
                    AND project.status = 'running'
                    AND run.lease_expires_at IS NOT NULL
                    AND run.lease_expires_at < CURRENT_TIMESTAMP
               )
            ORDER BY CASE WHEN run.status = 'queued' THEN 0 ELSE 1 END, run.created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    Optional<BuilderProjectRun> claimNextAvailableForUpdate();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select run from BuilderProjectRun run where run.id = :runId")
    Optional<BuilderProjectRun> findByIdForUpdate(@Param("runId") Long runId);
}
