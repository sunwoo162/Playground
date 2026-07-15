package com.playground.domain.feature.repository;

import com.playground.domain.feature.entity.FeatureRequest;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeatureRequestRepository extends JpaRepository<FeatureRequest, Long> {
}
