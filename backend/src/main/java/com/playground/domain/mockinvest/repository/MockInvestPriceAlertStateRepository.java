package com.playground.domain.mockinvest.repository;

import com.playground.domain.mockinvest.entity.MockInvestPriceAlertState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MockInvestPriceAlertStateRepository extends JpaRepository<MockInvestPriceAlertState, Long> {
    Optional<MockInvestPriceAlertState> findByUserIdAndSymbolAndSource(
            String userId,
            String symbol,
            MockInvestPriceAlertState.AlertSource source
    );
}
