package com.playground.domain.mockinvest.repository;

import com.playground.domain.mockinvest.entity.MockInvestHolding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MockInvestHoldingRepository extends JpaRepository<MockInvestHolding, Long> {
    List<MockInvestHolding> findByUserIdOrderByUpdatedAtDesc(String userId);
    Optional<MockInvestHolding> findByUserIdAndSymbol(String userId, String symbol);
}
