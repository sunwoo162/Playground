package com.playground.domain.mockinvest.repository;

import com.playground.domain.mockinvest.entity.MockInvestWatchlist;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MockInvestWatchlistRepository extends JpaRepository<MockInvestWatchlist, Long> {
    List<MockInvestWatchlist> findByUserIdOrderByCreatedAtDesc(String userId);
    Optional<MockInvestWatchlist> findByUserIdAndSymbol(String userId, String symbol);
    void deleteByUserIdAndSymbol(String userId, String symbol);
}
