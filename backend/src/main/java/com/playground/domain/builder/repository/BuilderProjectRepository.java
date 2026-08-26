package com.playground.domain.builder.repository;

import com.playground.domain.builder.entity.BuilderProject;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BuilderProjectRepository extends JpaRepository<BuilderProject, Long> {
    List<BuilderProject> findAllByOwnerIdOrderByCreatedAtDesc(String ownerId);

    Optional<BuilderProject> findByIdAndOwnerId(Long id, String ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select project from BuilderProject project where project.id = :projectId and project.ownerId = :ownerId")
    Optional<BuilderProject> findByIdAndOwnerIdForUpdate(
            @Param("projectId") Long projectId,
            @Param("ownerId") String ownerId
    );
}
