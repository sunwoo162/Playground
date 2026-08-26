package com.playground.domain.builder.repository;

import com.playground.domain.builder.entity.BuilderProjectRun;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
