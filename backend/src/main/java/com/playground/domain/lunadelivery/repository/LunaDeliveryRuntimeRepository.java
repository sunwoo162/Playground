package com.playground.domain.lunadelivery.repository;

import com.playground.domain.lunadelivery.entity.LunaDeliveryRuntime;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface LunaDeliveryRuntimeRepository extends JpaRepository<LunaDeliveryRuntime, Long> {
    List<LunaDeliveryRuntime> findByProjectIdOrderByRuntimeIdAsc(Long projectId);

    Optional<LunaDeliveryRuntime> findByProjectIdAndRuntimeId(Long projectId, String runtimeId);
}
