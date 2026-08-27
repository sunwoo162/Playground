package com.playground.domain.bloombouquet.repository;

import com.playground.domain.bloombouquet.entity.BloomBouquetSubmission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BloomBouquetSubmissionRepository extends JpaRepository<BloomBouquetSubmission, Long> {
    boolean existsByProjectIdAndVersion(Long projectId, String version);
    Optional<BloomBouquetSubmission> findTopByProjectIdOrderByCreatedAtDesc(Long projectId);
    List<BloomBouquetSubmission> findByProjectIdOrderByCreatedAtDesc(Long projectId);
}
