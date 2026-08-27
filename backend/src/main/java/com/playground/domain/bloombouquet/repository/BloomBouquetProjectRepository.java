package com.playground.domain.bloombouquet.repository;

import com.playground.domain.bloombouquet.entity.BloomBouquetProject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BloomBouquetProjectRepository extends JpaRepository<BloomBouquetProject, Long> {
    boolean existsByTeamIdAndSlug(Long teamId, String slug);
    Optional<BloomBouquetProject> findByIdAndTeamOwnerId(Long id, String ownerId);
    List<BloomBouquetProject> findByTeamOwnerIdOrderByUpdatedAtDesc(String ownerId);
    List<BloomBouquetProject> findByPublishedTrueOrderByUpdatedAtDesc();
}
