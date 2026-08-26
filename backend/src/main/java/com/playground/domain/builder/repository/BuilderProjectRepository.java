package com.playground.domain.builder.repository;

import com.playground.domain.builder.entity.BuilderProject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BuilderProjectRepository extends JpaRepository<BuilderProject, Long> {
    List<BuilderProject> findAllByOwnerIdOrderByCreatedAtDesc(String ownerId);

    Optional<BuilderProject> findByIdAndOwnerId(Long id, String ownerId);
}
