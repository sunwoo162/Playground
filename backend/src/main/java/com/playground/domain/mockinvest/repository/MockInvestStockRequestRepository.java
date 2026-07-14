package com.playground.domain.mockinvest.repository;

import com.playground.domain.mockinvest.entity.MockInvestStockRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MockInvestStockRequestRepository extends JpaRepository<MockInvestStockRequest, Long> {
    List<MockInvestStockRequest> findByUserIdOrderByCreatedAtDesc(String userId);
    List<MockInvestStockRequest> findAllByOrderByCreatedAtDesc();
}
