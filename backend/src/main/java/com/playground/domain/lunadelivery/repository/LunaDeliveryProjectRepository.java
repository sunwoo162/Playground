package com.playground.domain.lunadelivery.repository;

import com.playground.domain.lunadelivery.entity.LunaDeliveryProject;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface LunaDeliveryProjectRepository extends JpaRepository<LunaDeliveryProject, Long> {
    Optional<LunaDeliveryProject> findBySlug(String slug);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select project from LunaDeliveryProject project where project.slug = :slug")
    Optional<LunaDeliveryProject> findBySlugForUpdate(@Param("slug") String slug);
}
