package com.playground.domain.actionnotifier.repository;

import com.playground.domain.actionnotifier.entity.ActionRepositoryWatch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ActionRepositoryWatchRepository extends JpaRepository<ActionRepositoryWatch, Long> {
    List<ActionRepositoryWatch> findByUserIdOrderByUpdatedAtDesc(String userId);
    Optional<ActionRepositoryWatch> findByIdAndUserId(Long id, String userId);
    Optional<ActionRepositoryWatch> findByUserIdAndOwnerIgnoreCaseAndRepoIgnoreCase(String userId, String owner, String repo);
}
