package com.playground.domain.mockinvest.repository;

import com.playground.domain.mockinvest.entity.MockInvestAccount;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MockInvestAccountRepository extends JpaRepository<MockInvestAccount, String> {
}
