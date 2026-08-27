package com.playground.domain.bloombouquet.repository;

import com.playground.domain.bloombouquet.entity.BloomBouquetProject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BloomBouquetProjectRepository extends JpaRepository<BloomBouquetProject, Long> {
    boolean existsByTeam_IdAndSlug(Long teamId, String slug);
    Optional<BloomBouquetProject> findByIdAndTeam_OwnerId(Long id, String ownerId);
    List<BloomBouquetProject> findByTeam_OwnerIdOrderByUpdatedAtDesc(String ownerId);
    List<BloomBouquetProject> findByPublishedTrueOrderByUpdatedAtDesc();

    default boolean existsByTeamIdAndSlug(Long teamId, String slug) {
        return existsByTeam_IdAndSlug(teamId, slug);
    }

    default Optional<BloomBouquetProject> findByIdAndTeamOwnerId(Long id, String ownerId) {
        return findByIdAndTeam_OwnerId(id, ownerId);
    }
}
