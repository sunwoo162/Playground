package com.playground.domain.devnotes.repository;

import com.playground.domain.devnotes.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    List<Project> findByUserIdOrderByUpdatedAtDesc(String userId);
    Optional<Project> findByIdAndUserId(Long id, String userId);
}
