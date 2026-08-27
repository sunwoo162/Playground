package com.playground.domain.bloombouquet.repository;

import com.playground.domain.bloombouquet.entity.BloomBouquetTeam;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BloomBouquetTeamRepository extends JpaRepository<BloomBouquetTeam, Long> {
    List<BloomBouquetTeam> findByOwnerIdOrderByCreatedAtDesc(String ownerId);
    Optional<BloomBouquetTeam> findByIdAndOwnerId(Long id, String ownerId);
    boolean existsByOwnerIdAndSlug(String ownerId, String slug);
}
