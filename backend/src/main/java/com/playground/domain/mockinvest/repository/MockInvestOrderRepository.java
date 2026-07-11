package com.playground.domain.mockinvest.repository;

import com.playground.domain.mockinvest.entity.MockInvestOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MockInvestOrderRepository extends JpaRepository<MockInvestOrder, Long> {
    List<MockInvestOrder> findByUserIdOrderByCreatedAtDesc(String userId);
}
