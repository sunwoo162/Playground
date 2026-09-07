package com.playground.domain.bloombouquet.repository;

import com.playground.domain.bloombouquet.entity.BloomBouquetDevelopmentRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BloomBouquetDevelopmentRunRepository
        extends JpaRepository<BloomBouquetDevelopmentRun, Long> {
    Optional<BloomBouquetDevelopmentRun> findByProject_IdAndHarnessRunId(
            Long projectId,
            String harnessRunId
    );

    List<BloomBouquetDevelopmentRun> findByProject_IdOrderByCreatedAtDesc(Long projectId);
}
